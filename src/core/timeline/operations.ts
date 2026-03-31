/**
 * Timeline operations — pure mutation and query functions for timeline documents.
 * No UI or browser dependencies.
 */

import type { TimelineClip, TimelineTrack, TimelineDocument } from '../types'
import { getClipSpeed, getClipEffectiveDuration } from './clip-helpers'

/**
 * Compute the total duration of a timeline document (seconds).
 * This is the end time of the last clip across all tracks.
 */
export function computeTotalDuration(doc: TimelineDocument): number {
  let max = 0
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      const end = (clip.offset ?? 0) + getClipEffectiveDuration(clip)
      if (end > max) max = end
    }
  }
  return max
}

/**
 * Split a clip within a track at a given source time.
 * Mutates the track's clips array in-place.
 * Returns true if the split was performed.
 */
export function splitClipInTrack(
  track: TimelineTrack,
  clipIndex: number,
  atSourceTime?: number,
): boolean {
  const clip = track.clips[clipIndex]
  if (!clip) return false

  const duration = clip.out - clip.in
  if (duration < 0.2) return false

  const splitPoint = atSourceTime ?? clip.in + duration / 2
  if (splitPoint <= clip.in + 0.05 || splitPoint >= clip.out - 0.05) return false

  const speed = getClipSpeed(clip)
  const rightClip: TimelineClip = {
    sourceId: clip.sourceId,
    sourceName: clip.sourceName,
    in: splitPoint,
    out: clip.out,
    offset: (clip.offset ?? 0) + (splitPoint - clip.in) / speed,
    operations: clip.operations
      ? clip.operations.filter(op => op.type !== 'fade_in').map(op => ({ ...op }))
      : [],
  }

  // Left clip keeps fade_in, loses fade_out
  if (clip.operations) {
    clip.operations = clip.operations.filter(op => op.type !== 'fade_out').map(op => ({ ...op }))
  }

  clip.out = splitPoint
  track.clips.splice(clipIndex + 1, 0, rightClip)
  return true
}

/**
 * Split all clips at a given global playhead position (blade cut across all tracks).
 * Mutates the document's tracks in-place.
 * Returns true if any split was performed.
 */
export function splitAllAtPlayhead(doc: TimelineDocument, playheadTime: number): boolean {
  let didSplit = false

  // Iterate in reverse to handle index shifts from splicing
  for (let ti = doc.tracks.length - 1; ti >= 0; ti--) {
    const track = doc.tracks[ti]
    for (let ci = track.clips.length - 1; ci >= 0; ci--) {
      const clip = track.clips[ci]
      const clipStart = clip.offset ?? 0
      const speed = getClipSpeed(clip)
      const effectiveDuration = getClipEffectiveDuration(clip)
      const clipEnd = clipStart + effectiveDuration

      if (playheadTime > clipStart + 0.05 && playheadTime < clipEnd - 0.05) {
        // Compute the source time at the playhead position
        const sourceTime = clip.in + (playheadTime - clipStart) * speed
        if (splitClipInTrack(track, ci, sourceTime)) {
          didSplit = true
        }
      }
    }
  }

  return didSplit
}
