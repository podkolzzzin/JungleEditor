/**
 * Timeline constants — UI-agnostic values that define timeline behavior.
 */

/** Minimum pixels-per-second zoom level */
export const MIN_PPS = 4
/** Maximum pixels-per-second zoom level */
export const MAX_PPS = 200
/** Default pixels-per-second zoom level */
export const DEFAULT_PPS = 20
/** Default clip duration when dropping a source onto the timeline */
export const DEFAULT_CLIP_DURATION = 10
/** Color palette for track indicators */
export const TRACK_COLORS = ['#e06c75', '#e5c07b', '#98c379', '#56b6c2', '#c678dd', '#d19a66', '#61afef']

/** Get the color for a track by index (cycles through palette) */
export function trackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length]
}
