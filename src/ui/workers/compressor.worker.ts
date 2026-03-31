/**
 * Web Worker: Video Compressor
 *
 * Uses WebCodecs (VideoDecoder/VideoEncoder + AudioDecoder/AudioEncoder) and
 * MP4Box.js for demuxing, mp4-muxer for muxing, all without loading the
 * entire source file into RAM.
 *
 * Message protocol (main → worker):
 *   { type: 'start', file: File, settings: CompressSettings, writable: FileSystemWritableFileStream }
 *   { type: 'cancel' }
 *
 * Message protocol (worker → main):
 *   { type: 'progress', percent, fps, etaSeconds }
 *   { type: 'done' }
 *   { type: 'error', message: string }
 */

import { createFile, DataStream, Endianness } from 'mp4box'
import type { ISOFile, Movie, Track, Sample } from 'mp4box'
import { Muxer, FileSystemWritableFileStreamTarget } from 'mp4-muxer'
import type { CompressSettings } from '../../core/types'

// ── Constants ──

const CHUNK_SIZE = 4 * 1024 * 1024   // 4 MB read chunks
const MAX_ENCODE_QUEUE = 5           // backpressure threshold

// ── State ──

let cancelled = false

// ── Entry point ──

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data as
    | { type: 'start'; file: File; settings: CompressSettings; writable: FileSystemWritableFileStream }
    | { type: 'cancel' }

  if (msg.type === 'cancel') {
    cancelled = true
    return
  }

  if (msg.type === 'start') {
    cancelled = false
    try {
      await compress(msg.file, msg.settings, msg.writable)
      if (!cancelled) {
        self.postMessage({ type: 'done' })
      }
    } catch (err: unknown) {
      if (!cancelled) {
        self.postMessage({ type: 'error', message: (err as Error).message ?? String(err) })
      }
    }
  }
}

// ── Main compression pipeline ──

async function compress(
  file: File,
  settings: CompressSettings,
  writable: FileSystemWritableFileStream,
): Promise<void> {
  // ── 1. Demux with MP4Box ──
  const { videoTrack, audioTrack, videoSamples, audioSamples, totalDuration } =
    await demux(file)

  if (!videoTrack) throw new Error('No video track found in source file.')

  // ── 2. Compute output dimensions ──
  const srcW = videoTrack.video!.width
  const srcH = videoTrack.video!.height
  const { outW, outH } = computeOutputDimensions(srcW, srcH, settings)

  // ── 3. Configure muxer with FileSystemWritableFileStreamTarget ──
  const muxer = new Muxer({
    target: new FileSystemWritableFileStreamTarget(writable),
    video: {
      codec: settings.codec === 'vp09.00.10.08' ? 'vp9' : 'avc',
      width: outW,
      height: outH,
    },
    audio: audioTrack
      ? {
          codec: 'aac',
          numberOfChannels: audioTrack.audio!.channel_count,
          sampleRate: audioTrack.audio!.sample_rate,
        }
      : undefined,
    firstTimestampBehavior: 'offset',
    fastStart: false,
  })

  // ── 4. Configure VideoEncoder ──
  let encodedFrames = 0
  const totalVideoFrames = videoSamples.length
  let lastReportTime = performance.now()
  let lastReportFrame = 0

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta)
      encodedFrames++
      // Report progress every 30 frames
      if (encodedFrames % 30 === 0 || encodedFrames === totalVideoFrames) {
        const now = performance.now()
        const elapsedSec = (now - lastReportTime) / 1000
        const framesInWindow = encodedFrames - lastReportFrame
        const fps = elapsedSec > 0 ? framesInWindow / elapsedSec : 0
        const percent = totalVideoFrames > 0 ? (encodedFrames / totalVideoFrames) * 100 : 0
        const remaining = totalVideoFrames - encodedFrames
        const etaSeconds = fps > 0 ? remaining / fps : 0
        lastReportTime = now
        lastReportFrame = encodedFrames
        self.postMessage({ type: 'progress', percent, fps, etaSeconds })
      }
    },
    error: (err) => {
      throw err
    },
  })

  const avgFps = videoTrack.timescale / (videoTrack.samples_duration / videoTrack.nb_samples)

  videoEncoder.configure({
    codec: settings.codec,
    width: outW,
    height: outH,
    bitrate: settings.videoBitrate,
    framerate: settings.framerate ?? avgFps,
    latencyMode: 'quality',
  })

  // ── 5. Configure AudioEncoder (if audio track exists) ──
  let audioEncoder: AudioEncoder | null = null

  if (audioTrack) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta)
      },
      error: (err) => {
        throw err
      },
    })

    audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: audioTrack.audio!.sample_rate,
      numberOfChannels: audioTrack.audio!.channel_count,
      bitrate: settings.audioBitrate,
    })
  }

  // ── 6. Configure VideoDecoder ──
  const videoDecoder = new VideoDecoder({
    output: async (frame) => {
      try {
        // Backpressure: wait if encoder queue is full
        while (videoEncoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
          await new Promise<void>((r) => setTimeout(r, 5))
        }
        if (cancelled) {
          frame.close()
          return
        }
        // Let the encoder decide keyframe placement based on its internal scheduling
        videoEncoder.encode(frame)
      } finally {
        frame.close()
      }
    },
    error: (err) => {
      throw err
    },
  })

  // Extract avcC description from video track
  const description = extractVideoDescription(videoSamples)

  videoDecoder.configure({
    codec: videoTrack.codec,
    codedWidth: srcW,
    codedHeight: srcH,
    description: description ?? undefined,
  })

  // ── 7. Configure AudioDecoder (if audio track exists) ──
  let audioDecoder: AudioDecoder | null = null

  if (audioTrack && audioEncoder) {
    audioDecoder = new AudioDecoder({
      output: (audioData) => {
        try {
          if (!cancelled && audioEncoder) {
            audioEncoder.encode(audioData)
          }
        } finally {
          audioData.close()
        }
      },
      error: (err) => {
        throw err
      },
    })

    audioDecoder.configure({
      codec: audioTrack.codec,
      sampleRate: audioTrack.audio!.sample_rate,
      numberOfChannels: audioTrack.audio!.channel_count,
    })
  }

  // ── 8. Feed encoded chunks through decoders ──
  for (const sample of videoSamples) {
    if (cancelled) break
    if (!sample.data) continue
    const chunk = new EncodedVideoChunk({
      type: sample.is_sync ? 'key' : 'delta',
      timestamp: (sample.cts / sample.timescale) * 1_000_000,
      duration: (sample.duration / sample.timescale) * 1_000_000,
      data: sample.data,
    })
    videoDecoder.decode(chunk)
  }

  if (audioDecoder && audioSamples.length > 0) {
    for (const sample of audioSamples) {
      if (cancelled) break
      if (!sample.data) continue
      const chunk = new EncodedAudioChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: (sample.cts / sample.timescale) * 1_000_000,
        duration: (sample.duration / sample.timescale) * 1_000_000,
        data: sample.data,
      })
      audioDecoder.decode(chunk)
    }
  }

  if (cancelled) {
    videoDecoder.close()
    videoEncoder.close()
    audioDecoder?.close()
    audioEncoder?.close()
    await writable.close()
    return
  }

  // ── 9. Flush and finalize ──
  await videoDecoder.flush()
  await videoEncoder.flush()

  if (audioDecoder && audioEncoder) {
    await audioDecoder.flush()
    await audioEncoder.flush()
  }

  muxer.finalize()
  await writable.close()

  void totalDuration // used for ETA calculations future improvements
}

// ── Demuxer ──

interface DemuxResult {
  videoTrack: Track | null
  audioTrack: Track | null
  videoSamples: Sample[]
  audioSamples: Sample[]
  totalDuration: number
}

function demux(file: File): Promise<DemuxResult> {
  return new Promise((resolve, reject) => {
    const mp4file: ISOFile = createFile()
    const videoSamples: Sample[] = []
    const audioSamples: Sample[] = []
    let videoTrackId = -1
    let audioTrackId = -1
    let videoTrackInfo: Track | null = null
    let audioTrackInfo: Track | null = null
    let totalDuration = 0

    mp4file.onReady = (info: Movie) => {
      totalDuration = info.duration / info.timescale

      // Find first video track
      const vTrack = info.videoTracks[0] ?? null
      if (vTrack) {
        videoTrackId = vTrack.id
        videoTrackInfo = vTrack
        mp4file.setExtractionOptions(vTrack.id, undefined, { nbSamples: 1000 })
      }

      // Find first audio track
      const aTrack = info.audioTracks[0] ?? null
      if (aTrack) {
        audioTrackId = aTrack.id
        audioTrackInfo = aTrack
        mp4file.setExtractionOptions(aTrack.id, undefined, { nbSamples: 1000 })
      }

      mp4file.start()
    }

    mp4file.onSamples = (id: number, _user: unknown, samples: Sample[]) => {
      if (id === videoTrackId) {
        videoSamples.push(...samples)
      } else if (id === audioTrackId) {
        audioSamples.push(...samples)
      }
    }

    mp4file.onError = (_module: string, message: string) => reject(new Error(message))

    // Chunk-read the file (4 MB at a time)
    let offset = 0

    function readNextChunk() {
      if (offset >= file.size) {
        mp4file.flush()
        resolve({
          videoTrack: videoTrackInfo,
          audioTrack: audioTrackInfo,
          videoSamples,
          audioSamples,
          totalDuration,
        })
        return
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE)
      slice.arrayBuffer().then((arrayBuffer) => {
        ;(arrayBuffer as any).fileStart = offset
        mp4file.appendBuffer(arrayBuffer as any)
        offset += CHUNK_SIZE
        // Continue reading on next microtask
        setTimeout(readNextChunk, 0)
      }).catch(reject)
    }

    readNextChunk()
  })
}

// ── Helpers ──

function computeOutputDimensions(
  srcW: number,
  srcH: number,
  settings: CompressSettings,
): { outW: number; outH: number } {
  if (settings.scaleWidth && settings.scaleHeight) {
    return { outW: settings.scaleWidth, outH: settings.scaleHeight }
  }
  if (settings.scaleWidth) {
    const ratio = settings.scaleWidth / srcW
    return { outW: settings.scaleWidth, outH: Math.round(srcH * ratio) }
  }
  if (settings.scaleHeight) {
    const ratio = settings.scaleHeight / srcH
    return { outW: Math.round(srcW * ratio), outH: settings.scaleHeight }
  }
  return { outW: srcW, outH: srcH }
}

/** Extract codec-specific description box (avcC / hvcC / vpcC) from sample descriptions. */
function extractVideoDescription(samples: Sample[]): ArrayBuffer | null {
  // MP4Box attaches description to samples; the first sample's description holds the codec config
  if (samples.length === 0) return null
  const desc = samples[0].description as any
  if (!desc) return null

  const box = desc.avcC ?? desc.hvcC ?? desc.vpcC
  if (!box) return null

  try {
    const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
    box.write(stream)
    // Skip the 8-byte box header (4 bytes size + 4 bytes type)
    return (stream.buffer as ArrayBuffer).slice(8)
  } catch {
    return null
  }
}

