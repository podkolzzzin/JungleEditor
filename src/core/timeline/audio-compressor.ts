/**
 * Audio compressor helpers — pure functions to read compressor params from clips.
 * No browser or Vue dependencies.
 */

import type { TimelineClip } from '../types'

/** Parameters for the Web Audio DynamicsCompressorNode + makeup gain */
export interface AudioCompressorParams {
  /** Threshold in dB (-100 to 0) */
  threshold: number
  /** Compression ratio (1 to 20) */
  ratio: number
  /** Attack time in seconds (0 to 1) */
  attack: number
  /** Release time in seconds (0 to 1) */
  release: number
  /** Knee width in dB (0 to 40) */
  knee: number
  /** Makeup gain in dB (0 to 24) */
  makeupGain: number
}

/** Default compressor settings (gentle compression, similar to OBS defaults) */
export const DEFAULT_AUDIO_COMPRESSOR: AudioCompressorParams = {
  threshold: -24,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
  knee: 30,
  makeupGain: 0,
}

/** Check whether a clip has an audio_compressor operation */
export function hasAudioCompressor(clip: TimelineClip): boolean {
  return clip.operations?.some(op => op.type === 'audio_compressor') ?? false
}

/**
 * Read audio compressor parameters from a clip.
 * Returns null if no audio_compressor operation is present.
 */
export function getClipAudioCompressor(clip: TimelineClip): AudioCompressorParams | null {
  const op = clip.operations?.find(o => o.type === 'audio_compressor')
  if (!op) return null

  return {
    threshold:  op.threshold  ?? DEFAULT_AUDIO_COMPRESSOR.threshold,
    ratio:      op.ratio      ?? DEFAULT_AUDIO_COMPRESSOR.ratio,
    attack:     op.attack     ?? DEFAULT_AUDIO_COMPRESSOR.attack,
    release:    op.release    ?? DEFAULT_AUDIO_COMPRESSOR.release,
    knee:       op.knee       ?? DEFAULT_AUDIO_COMPRESSOR.knee,
    makeupGain: op.makeupGain ?? DEFAULT_AUDIO_COMPRESSOR.makeupGain,
  }
}
