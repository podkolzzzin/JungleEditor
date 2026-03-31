/**
 * Color grading parameters and built-in profiles.
 * Pure data — no browser or Vue dependencies.
 */

/** All numeric color grading parameters with explicit defaults */
export interface ColorGradeParams {
  brightness: number   // -1 to +1, default 0
  contrast: number     // 0 to 3,   default 1
  saturation: number   // 0 to 3,   default 1
  exposure: number     // -3 to +3, default 0
  temperature: number  // -1 to +1, default 0
  tint: number         // -1 to +1, default 0
  rGain: number        // 0 to 2,   default 1
  gGain: number        // 0 to 2,   default 1
  bGain: number        // 0 to 2,   default 1
}

/** Neutral (identity) color grade — no effect on the image */
export const DEFAULT_COLOR_GRADE: ColorGradeParams = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  exposure: 0,
  temperature: 0,
  tint: 0,
  rGain: 1,
  gGain: 1,
  bGain: 1,
}

/** Built-in color profiles — pure lookup table, no runtime logic */
export const COLOR_PROFILES: Record<string, ColorGradeParams> = {
  'Cinematic Warm': {
    brightness: -0.05,
    contrast: 1.2,
    saturation: 0.9,
    exposure: 0,
    temperature: 0.3,
    tint: 0,
    rGain: 1.05,
    gGain: 1.0,
    bGain: 0.9,
  },
  'Teal & Orange': {
    brightness: 0,
    contrast: 1.1,
    saturation: 1.2,
    exposure: 0,
    temperature: 0.25,
    tint: -0.1,
    rGain: 1.1,
    gGain: 0.95,
    bGain: 0.85,
  },
  'Bleach Bypass': {
    brightness: 0,
    contrast: 1.6,
    saturation: 0.4,
    exposure: 0.1,
    temperature: 0,
    tint: 0,
    rGain: 1.0,
    gGain: 1.0,
    bGain: 1.0,
  },
  'Film Noir': {
    brightness: -0.05,
    contrast: 1.8,
    saturation: 0.05,
    exposure: -0.1,
    temperature: 0,
    tint: 0,
    rGain: 1.0,
    gGain: 1.0,
    bGain: 1.0,
  },
  'Vintage Film': {
    brightness: 0.08,
    contrast: 0.85,
    saturation: 0.75,
    exposure: 0,
    temperature: 0.25,
    tint: 0.1,
    rGain: 1.05,
    gGain: 1.0,
    bGain: 0.85,
  },
  'Cool Moonlight': {
    brightness: -0.05,
    contrast: 1.05,
    saturation: 0.8,
    exposure: -0.15,
    temperature: -0.35,
    tint: 0,
    rGain: 0.9,
    gGain: 0.95,
    bGain: 1.1,
  },
  'Golden Hour': {
    brightness: 0.05,
    contrast: 1.0,
    saturation: 1.1,
    exposure: 0.3,
    temperature: 0.5,
    tint: 0.05,
    rGain: 1.15,
    gGain: 1.05,
    bGain: 0.85,
  },
  'Muted Pastel': {
    brightness: 0.1,
    contrast: 0.75,
    saturation: 0.65,
    exposure: 0.05,
    temperature: 0.1,
    tint: 0,
    rGain: 1.0,
    gGain: 1.0,
    bGain: 1.0,
  },
  'High Contrast B&W': {
    brightness: 0.05,
    contrast: 1.7,
    saturation: 0,
    exposure: 0,
    temperature: 0,
    tint: 0,
    rGain: 1.0,
    gGain: 1.0,
    bGain: 1.0,
  },
  'Cyberpunk': {
    brightness: 0,
    contrast: 1.4,
    saturation: 1.6,
    exposure: 0,
    temperature: -0.2,
    tint: 0.3,
    rGain: 1.0,
    gGain: 0.9,
    bGain: 1.15,
  },
}
