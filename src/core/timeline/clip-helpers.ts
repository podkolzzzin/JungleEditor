/**
 * Clip helper functions — pure business logic for timeline clips.
 * No UI or browser dependencies.
 */

import type { TimelineClip, TimelineTrack } from '../types'
import { getClipColorGrade, type ColorGradeParams } from '../color'

// ── Speed / duration helpers ──

/** Get the effective playback speed of a clip (reads the 'speed' operation) */
export function getClipSpeed(clip: TimelineClip): number {
  const speedOp = clip.operations?.find(op => op.type === 'speed')
  return speedOp?.rate && speedOp.rate > 0 ? speedOp.rate : 1
}

/** Get the effective duration of a clip on the timeline (source duration / speed) */
export function getClipEffectiveDuration(clip: TimelineClip): number {
  return (clip.out - clip.in) / getClipSpeed(clip)
}

// ── Opacity / fade helpers ──

/** Compute the opacity of a clip at a given local time (applies fade_in / fade_out) */
export function computeClipOpacity(clip: TimelineClip, localTime: number): number {
  const effectiveDuration = getClipEffectiveDuration(clip)
  let opacity = 1
  if (clip.operations) {
    for (const op of clip.operations) {
      if (op.type === 'fade_in' && op.duration && op.duration > 0) {
        if (localTime < op.duration) {
          opacity *= Math.max(0, localTime / op.duration)
        }
      }
      if (op.type === 'fade_out' && op.duration && op.duration > 0) {
        const fadeStart = effectiveDuration - op.duration
        if (localTime > fadeStart) {
          opacity *= Math.max(0, (effectiveDuration - localTime) / op.duration)
        }
      }
    }
  }
  return Math.max(0, Math.min(1, opacity))
}

// ── Mute helper ──

/** Check if a clip has a mute operation */
export function isClipMuted(clip: TimelineClip): boolean {
  return clip.operations?.some(op => op.type === 'mute') ?? false
}

// ── Active clip resolution ──

/** Information about the active clip at a given timeline position */
export interface ActiveClipInfo {
  clip: TimelineClip
  trackIndex: number
  clipIndex: number
  /** Source video time (seconds) to seek to */
  sourceTime: number
  /** Time elapsed within the clip (seconds) */
  localTime: number
  /** Computed opacity (0–1) after applying fade operations */
  opacity: number
  /** Effective playback speed */
  speed: number
  /** Whether audio should be muted */
  muted: boolean
  /** Track volume level (0–1) */
  trackVolume: number
  /** Color grade parameters for this clip (optional — absent when no color_grade op) */
  colorGrade?: ColorGradeParams
}

/**
 * Find the topmost active clip at a given global timeline time.
 * Returns null if no clip is active at that time.
 */
export function findActiveClip(
  tracks: TimelineTrack[],
  time: number,
): ActiveClipInfo | null {
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti]
    for (let ci = 0; ci < track.clips.length; ci++) {
      const clip = track.clips[ci]
      const clipOffset = clip.offset ?? 0
      const speed = getClipSpeed(clip)
      const effectiveDuration = getClipEffectiveDuration(clip)
      if (time >= clipOffset && time < clipOffset + effectiveDuration) {
        const localTime = time - clipOffset
        const sourceTime = clip.in + localTime * speed
        const opacity = computeClipOpacity(clip, localTime)
        const muted = isClipMuted(clip)
        const trackVolume = track.volume ?? 1
        const hasColorGrade = clip.operations?.some(op => op.type === 'color_grade') ?? false
        const colorGrade = hasColorGrade ? getClipColorGrade(clip) : undefined
        return { clip, trackIndex: ti, clipIndex: ci, sourceTime, localTime, opacity, speed, muted, trackVolume, colorGrade }
      }
    }
  }
  return null
}

/**
 * Find ALL active clips at a given global timeline time (across all tracks).
 * Returns them in bottom-to-top order (track 0 is at the bottom, last track on top)
 * so they can be composited in painter's order.
 */
export function findAllActiveClips(
  tracks: TimelineTrack[],
  time: number,
): ActiveClipInfo[] {
  const results: ActiveClipInfo[] = []
  for (let ti = tracks.length - 1; ti >= 0; ti--) {
    const track = tracks[ti]
    for (let ci = 0; ci < track.clips.length; ci++) {
      const clip = track.clips[ci]
      const clipOffset = clip.offset ?? 0
      const speed = getClipSpeed(clip)
      const effectiveDuration = getClipEffectiveDuration(clip)
      if (time >= clipOffset && time < clipOffset + effectiveDuration) {
        const localTime = time - clipOffset
        const sourceTime = clip.in + localTime * speed
        const opacity = computeClipOpacity(clip, localTime)
        const muted = isClipMuted(clip)
        const trackVolume = track.volume ?? 1
        const hasColorGrade = clip.operations?.some(op => op.type === 'color_grade') ?? false
        const colorGrade = hasColorGrade ? getClipColorGrade(clip) : undefined
        results.push({ clip, trackIndex: ti, clipIndex: ci, sourceTime, localTime, opacity, speed, muted, trackVolume, colorGrade })
      }
    }
  }
  return results
}
