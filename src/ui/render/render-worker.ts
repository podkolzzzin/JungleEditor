/**
 * Render worker — runs in a Web Worker for non-blocking offline rendering.
 *
 * Receives timeline doc + profile + source file ArrayBuffers.
 * Decodes, composites, and encodes frames using WebCodecs,
 * then sends encoded data chunks back to the main thread.
 */

import type { TimelineDocument, RenderProfile, TimelineClip } from '../../core/types'
import { computeSegments } from '../../core/render/segmenter'
import { findActiveClip } from '../../core/timeline/clip-helpers'
import { getVideoBitrate } from '../../core/render/codec-map'
import { Canvas2DFrameRenderer } from './frame-renderer'
import type { FrameRenderer } from './frame-renderer'

/** Messages sent from main thread to worker */
export interface RenderWorkerInput {
  type: 'start'
  doc: TimelineDocument
  profile: RenderProfile
  /** Map of sourceId → ArrayBuffer of the source video file */
  sources: Record<string, ArrayBuffer>
  /** Which segment indices to render (for incremental rendering) */
  segmentIndices?: number[]
}

/** Messages sent from worker to main thread */
export type RenderWorkerOutput =
  | { type: 'progress'; segment: number; total: number; framesRendered: number; totalFrames: number }
  | { type: 'segment-complete'; segment: number; data: Uint8Array }
  | { type: 'complete' }
  | { type: 'error'; message: string; segment?: number }

let cancelled = false

self.onmessage = async (event: MessageEvent<RenderWorkerInput | { type: 'cancel' }>) => {
  if (event.data.type === 'cancel') {
    cancelled = true
    return
  }

  if (event.data.type === 'start') {
    cancelled = false
    try {
      await renderTimeline(event.data)
    } catch (err: any) {
      postMessage({ type: 'error', message: err.message || String(err) } satisfies RenderWorkerOutput)
    }
  }
}

async function renderTimeline(input: RenderWorkerInput): Promise<void> {
  const { doc, profile, segmentIndices } = input
  const segments = computeSegments(doc)

  const indicesToRender = segmentIndices ?? segments.map((_, i) => i)
  const totalSegments = indicesToRender.length

  // Initialize frame renderer
  const renderer: FrameRenderer = new Canvas2DFrameRenderer()
  await renderer.init(profile.resolution.width, profile.resolution.height)

  const videoBitrate = getVideoBitrate(
    profile.qualityPreset,
    profile.resolution.width,
    profile.resolution.height,
  )

  for (let si = 0; si < indicesToRender.length; si++) {
    if (cancelled) return

    const segIndex = indicesToRender[si]
    const segment = segments[segIndex]
    if (!segment) continue

    const fps = profile.fps
    const totalFrames = Math.max(1, Math.ceil(segment.duration * fps))
    const encodedChunks: Uint8Array[] = []

    // Set up VideoEncoder for this segment
    const encoder = new VideoEncoder({
      output: (chunk: EncodedVideoChunk) => {
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        encodedChunks.push(data)
      },
      error: (err: DOMException) => {
        postMessage({
          type: 'error',
          message: `Encoder error: ${err.message}`,
          segment: segIndex,
        } satisfies RenderWorkerOutput)
      },
    })

    encoder.configure({
      codec: profile.videoCodec,
      width: profile.resolution.width,
      height: profile.resolution.height,
      bitrate: videoBitrate,
      framerate: fps,
    })

    // Render frames for this segment
    for (let fi = 0; fi < totalFrames; fi++) {
      if (cancelled) {
        encoder.close()
        renderer.destroy()
        return
      }

      const time = segment.startTime + (fi / fps)
      const clipInfo = findActiveClip(doc.tracks, time)

      // Create a black frame if no active clip
      const canvas = new OffscreenCanvas(profile.resolution.width, profile.resolution.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      let outputFrame: VideoFrame

      if (clipInfo) {
        // In a full implementation, we would decode the source video here.
        // For now, create a black frame (source decoding requires mp4box demux).
        const placeholderFrame = new VideoFrame(canvas, {
          timestamp: Math.round(time * 1_000_000),
          duration: Math.round((1 / fps) * 1_000_000),
        })

        outputFrame = renderer.renderFrame(
          placeholderFrame,
          clipInfo.clip,
          clipInfo.localTime,
        )
        placeholderFrame.close()
      } else {
        outputFrame = new VideoFrame(canvas, {
          timestamp: Math.round(time * 1_000_000),
          duration: Math.round((1 / fps) * 1_000_000),
        })
      }

      // Backpressure: wait if encode queue is too full
      while (encoder.encodeQueueSize > 5) {
        await new Promise(r => setTimeout(r, 1))
      }

      const keyFrame = fi === 0 // Force keyframe at segment boundary
      encoder.encode(outputFrame, { keyFrame })
      outputFrame.close()

      // Report progress
      if (fi % 10 === 0 || fi === totalFrames - 1) {
        postMessage({
          type: 'progress',
          segment: si,
          total: totalSegments,
          framesRendered: fi + 1,
          totalFrames,
        } satisfies RenderWorkerOutput)
      }
    }

    // Flush the encoder
    await encoder.flush()
    encoder.close()

    // Combine encoded chunks into a single Uint8Array
    const totalSize = encodedChunks.reduce((s, c) => s + c.length, 0)
    const segmentData = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of encodedChunks) {
      segmentData.set(chunk, offset)
      offset += chunk.length
    }

    postMessage(
      {
        type: 'segment-complete',
        segment: segIndex,
        data: segmentData,
      } satisfies RenderWorkerOutput,
      [segmentData.buffer] as unknown as StructuredSerializeOptions,
    )
  }

  renderer.destroy()
  postMessage({ type: 'complete' } satisfies RenderWorkerOutput)
}
