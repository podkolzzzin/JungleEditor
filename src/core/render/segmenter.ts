/**
 * Segment-based timeline division for rendering — pure function.
 * Divides the timeline into clip-edge-aligned segments for independent rendering.
 */

import type { TimelineDocument, TimelineClip, TimelineTrack } from '../types'
import { getClipEffectiveDuration, getClipSpeed } from '../timeline/clip-helpers'

/** A render segment covering a time range of the timeline */
export interface RenderSegment {
  index: number
  startTime: number
  endTime: number
  duration: number
  /** Active clip references within this segment */
  clips: SegmentClipRef[]
}

/** Reference to a clip active during a segment */
export interface SegmentClipRef {
  trackIndex: number
  clipIndex: number
  clip: TimelineClip
  /** Source video start time for this segment */
  sourceStart: number
  /** Source video end time for this segment */
  sourceEnd: number
}

/**
 * Compute clip-edge-aligned segments for the entire timeline.
 * Boundaries occur at every clip start/end across all tracks.
 * Long segments are subdivided; very short segments are merged.
 */
export function computeSegments(
  doc: TimelineDocument,
  maxDuration = 10,
  minDuration = 0.1,
): RenderSegment[] {
  // Collect all edge times across all tracks
  const edges = new Set<number>()
  edges.add(0)

  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      const offset = clip.offset ?? 0
      const effectiveDuration = getClipEffectiveDuration(clip)
      edges.add(offset)
      edges.add(offset + effectiveDuration)
    }
  }

  // Sort edges
  const sortedEdges = Array.from(edges).sort((a, b) => a - b)

  // Build raw segments from edges
  const rawSegments: Array<{ start: number; end: number }> = []
  for (let i = 0; i < sortedEdges.length - 1; i++) {
    const start = sortedEdges[i]
    const end = sortedEdges[i + 1]
    if (end - start > 0) {
      rawSegments.push({ start, end })
    }
  }

  if (rawSegments.length === 0) return []

  // Merge very short segments
  const merged: Array<{ start: number; end: number }> = []
  let current = rawSegments[0]
  for (let i = 1; i < rawSegments.length; i++) {
    if (current.end - current.start < minDuration) {
      current = { start: current.start, end: rawSegments[i].end }
    } else {
      merged.push(current)
      current = rawSegments[i]
    }
  }
  merged.push(current)

  // Subdivide long segments
  const subdivided: Array<{ start: number; end: number }> = []
  for (const seg of merged) {
    const duration = seg.end - seg.start
    if (duration <= maxDuration) {
      subdivided.push(seg)
    } else {
      const count = Math.ceil(duration / maxDuration)
      const subDuration = duration / count
      for (let i = 0; i < count; i++) {
        subdivided.push({
          start: seg.start + i * subDuration,
          end: seg.start + (i + 1) * subDuration,
        })
      }
    }
  }

  // Build final segments with clip references
  return subdivided.map((seg, index) => ({
    index,
    startTime: seg.start,
    endTime: seg.end,
    duration: seg.end - seg.start,
    clips: resolveActiveClips(doc.tracks, seg.start, seg.end),
  }))
}

/**
 * Resolve all clips active within a time range across all tracks.
 */
export function resolveActiveClips(
  tracks: TimelineTrack[],
  startTime: number,
  endTime: number,
): SegmentClipRef[] {
  const refs: SegmentClipRef[] = []

  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti]
    for (let ci = 0; ci < track.clips.length; ci++) {
      const clip = track.clips[ci]
      const offset = clip.offset ?? 0
      const effectiveDuration = getClipEffectiveDuration(clip)
      const clipEnd = offset + effectiveDuration

      // Check overlap
      if (offset < endTime && clipEnd > startTime) {
        const speed = getClipSpeed(clip)
        const overlapStart = Math.max(startTime, offset)
        const overlapEnd = Math.min(endTime, clipEnd)
        const sourceStart = clip.in + (overlapStart - offset) * speed
        const sourceEnd = clip.in + (overlapEnd - offset) * speed

        refs.push({
          trackIndex: ti,
          clipIndex: ci,
          clip,
          sourceStart,
          sourceEnd,
        })
      }
    }
  }

  return refs
}
