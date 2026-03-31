/**
 * Core render module — re-exports all render-related pure logic.
 */

export { computeSegments, resolveActiveClips } from './segmenter'
export type { RenderSegment, SegmentClipRef } from './segmenter'

export { buildFingerprintInput, computeFingerprint } from './fingerprint'

export { serializeSegmentData, deserializeSegmentData } from './segment-format'
export type { SegmentData } from './segment-format'

export {
  CODEC_REGISTRY,
  QUALITY_BITRATE_MAP,
  AUDIO_BITRATE_PRESETS,
  getCodecsForContainer,
  scaleBitrateForResolution,
  getVideoBitrate,
} from './codec-map'
export type { CodecEntry, QualityBitrateMap } from './codec-map'
