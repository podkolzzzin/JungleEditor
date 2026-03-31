/**
 * Clip color-grade helpers — reads color_grade operations from a clip.
 * Pure function, no browser or Vue dependencies.
 */

import type { TimelineClip } from '../types'
import { DEFAULT_COLOR_GRADE, COLOR_PROFILES } from './color-profiles'
import type { ColorGradeParams } from './color-profiles'

/**
 * Resolve the effective color grade for a clip.
 * Reads the first `color_grade` operation, resolves any named profile,
 * and merges with defaults. Returns `DEFAULT_COLOR_GRADE` when no
 * color_grade operation is present.
 */
export function getClipColorGrade(clip: TimelineClip): ColorGradeParams {
  const op = clip.operations?.find(o => o.type === 'color_grade')
  if (!op) return DEFAULT_COLOR_GRADE

  // Start with defaults, then apply profile (if named), then operation's own fields
  const base: ColorGradeParams = op.profileName && COLOR_PROFILES[op.profileName]
    ? { ...COLOR_PROFILES[op.profileName] }
    : { ...DEFAULT_COLOR_GRADE }

  // Individual field overrides written directly on the operation take precedence
  // only when the field is explicitly set (not undefined).
  return {
    brightness:  op.brightness  !== undefined ? op.brightness  : base.brightness,
    contrast:    op.contrast    !== undefined ? op.contrast    : base.contrast,
    saturation:  op.saturation  !== undefined ? op.saturation  : base.saturation,
    exposure:    op.exposure    !== undefined ? op.exposure    : base.exposure,
    temperature: op.temperature !== undefined ? op.temperature : base.temperature,
    tint:        op.tint        !== undefined ? op.tint        : base.tint,
    rGain:       op.rGain       !== undefined ? op.rGain       : base.rGain,
    gGain:       op.gGain       !== undefined ? op.gGain       : base.gGain,
    bGain:       op.bGain       !== undefined ? op.bGain       : base.bGain,
  }
}
