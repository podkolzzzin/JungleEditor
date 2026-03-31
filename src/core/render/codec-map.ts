/**
 * Codec registry and quality/bitrate mappings — pure data.
 * Maps user-facing codec names to WebCodecs codec strings,
 * container compatibility, and quality presets.
 */

/** A codec entry in the registry */
export interface CodecEntry {
  /** User-facing display name */
  displayName: string
  /** WebCodecs codec string */
  codecString: string
  /** Compatible containers */
  containers: Array<'mp4' | 'webm'>
  /** MIME type for muxing (used by mp4-muxer) */
  mimeType: string
}

/** Quality preset with corresponding bitrate settings */
export interface QualityBitrateMap {
  /** Bitrate in bps for 1080p at this quality level (scale proportionally for other resolutions) */
  videoBitrate1080p: number
  /** Description */
  label: string
}

/** Registry of supported video codecs */
export const CODEC_REGISTRY: CodecEntry[] = [
  {
    displayName: 'H.264',
    codecString: 'avc1.640028',
    containers: ['mp4'],
    mimeType: 'video/avc',
  },
  {
    displayName: 'VP9',
    codecString: 'vp09.00.10.08',
    containers: ['webm', 'mp4'],
    mimeType: 'video/vp9',
  },
  {
    displayName: 'AV1',
    codecString: 'av01.0.04M.08',
    containers: ['mp4', 'webm'],
    mimeType: 'video/av1',
  },
]

/** Quality preset → bitrate mapping (for 1080p; scale for other resolutions) */
export const QUALITY_BITRATE_MAP: Record<string, QualityBitrateMap> = {
  low: { videoBitrate1080p: 2_000_000, label: 'Low' },
  medium: { videoBitrate1080p: 6_000_000, label: 'Medium' },
  high: { videoBitrate1080p: 12_000_000, label: 'High' },
  lossless: { videoBitrate1080p: 40_000_000, label: 'Lossless' },
}

/** Audio bitrate presets (bps) */
export const AUDIO_BITRATE_PRESETS = [128_000, 192_000, 256_000] as const

/**
 * Get codecs compatible with a given container format.
 */
export function getCodecsForContainer(container: 'mp4' | 'webm'): CodecEntry[] {
  return CODEC_REGISTRY.filter(c => c.containers.includes(container))
}

/**
 * Scale a 1080p bitrate to match a target resolution.
 */
export function scaleBitrateForResolution(
  baseBitrate: number,
  targetWidth: number,
  targetHeight: number,
): number {
  const basePixels = 1920 * 1080
  const targetPixels = targetWidth * targetHeight
  return Math.round(baseBitrate * (targetPixels / basePixels))
}

/**
 * Get the recommended video bitrate for a given quality preset and resolution.
 */
export function getVideoBitrate(
  qualityPreset: string,
  width: number,
  height: number,
): number {
  const quality = QUALITY_BITRATE_MAP[qualityPreset]
  if (!quality) return 6_000_000 // fallback to medium
  return scaleBitrateForResolution(quality.videoBitrate1080p, width, height)
}
