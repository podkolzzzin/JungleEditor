/**
 * Runtime codec detection using WebCodecs API.
 * Filters available codecs based on browser support.
 */

import { CODEC_REGISTRY } from '../../core/render/codec-map'
import type { CodecEntry } from '../../core/render/codec-map'

/** A codec with its runtime support status */
export interface SupportedCodec extends CodecEntry {
  supported: boolean
}

/**
 * Detect which video codecs are supported by the browser's VideoEncoder.
 * Returns the codec registry entries with a `supported` flag.
 */
export async function detectSupportedCodecs(): Promise<SupportedCodec[]> {
  if (typeof VideoEncoder === 'undefined') {
    // WebCodecs not available — mark all as unsupported
    return CODEC_REGISTRY.map(c => ({ ...c, supported: false }))
  }

  const results: SupportedCodec[] = []

  for (const codec of CODEC_REGISTRY) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: codec.codecString,
        width: 1920,
        height: 1080,
        bitrate: 6_000_000,
        framerate: 30,
      })
      results.push({ ...codec, supported: !!support.supported })
    } catch {
      results.push({ ...codec, supported: false })
    }
  }

  return results
}

/**
 * Detect supported audio codecs.
 */
export async function detectSupportedAudioCodecs(): Promise<{ aac: boolean; opus: boolean }> {
  if (typeof AudioEncoder === 'undefined') {
    return { aac: false, opus: false }
  }

  let aac = false
  let opus = false

  try {
    const aacSupport = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 128_000,
    })
    aac = !!aacSupport.supported
  } catch { /* not supported */ }

  try {
    const opusSupport = await AudioEncoder.isConfigSupported({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128_000,
    })
    opus = !!opusSupport.supported
  } catch { /* not supported */ }

  return { aac, opus }
}
