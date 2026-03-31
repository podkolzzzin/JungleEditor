/**
 * Core timeline module — re-exports all timeline-related logic.
 */

export { MIN_PPS, MAX_PPS, DEFAULT_PPS, DEFAULT_CLIP_DURATION, TRACK_COLORS, trackColor } from './constants'
export { formatTime, formatTimeFull, parseTimeInput } from './format'
export {
  getClipSpeed,
  getClipEffectiveDuration,
  computeClipOpacity,
  isClipMuted,
  findActiveClip,
  findAllActiveClips,
  type ActiveClipInfo,
} from './clip-helpers'
export { computeTotalDuration, splitClipInTrack, splitAllAtPlayhead } from './operations'
export {
  DEFAULT_AUDIO_COMPRESSOR,
  hasAudioCompressor,
  getClipAudioCompressor,
  type AudioCompressorParams,
} from './audio-compressor'
