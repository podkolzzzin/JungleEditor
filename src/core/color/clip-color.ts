/**
 * Color grading helpers for timeline clips.
 * Pure functions — no browser or Vue dependencies.
 */

import type { TimelineClip } from '../types'
import { COLOR_PROFILES, DEFAULT_COLOR_GRADE, type ColorGradeParams } from './color-profiles'

/**
 * Read the color grade parameters for a clip.
 * Reads the first `color_grade` operation, resolves `profileName` if set,
 * merges with DEFAULT_COLOR_GRADE defaults, and returns the result.
 */
export function getClipColorGrade(clip: TimelineClip): ColorGradeParams {
  const op = clip.operations?.find(o => o.type === 'color_grade')
  if (!op) return DEFAULT_COLOR_GRADE

  // If a profile is selected, use it as the base (then allow per-field overrides below)
  const profileBase = op.profileName ? (COLOR_PROFILES[op.profileName] ?? DEFAULT_COLOR_GRADE) : DEFAULT_COLOR_GRADE

  return {
    brightness:  op.brightness  !== undefined ? op.brightness  : profileBase.brightness,
    contrast:    op.contrast    !== undefined ? op.contrast    : profileBase.contrast,
    saturation:  op.saturation  !== undefined ? op.saturation  : profileBase.saturation,
    exposure:    op.exposure    !== undefined ? op.exposure    : profileBase.exposure,
    temperature: op.temperature !== undefined ? op.temperature : profileBase.temperature,
    tint:        op.tint        !== undefined ? op.tint        : profileBase.tint,
    rGain:       op.rGain       !== undefined ? op.rGain       : profileBase.rGain,
    gGain:       op.gGain       !== undefined ? op.gGain       : profileBase.gGain,
    bGain:       op.bGain       !== undefined ? op.bGain       : profileBase.bGain,
  }
}
