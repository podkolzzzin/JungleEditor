/**
 * Segment fingerprinting for render cache invalidation — pure functions.
 * Uses SHA-256 via crypto.subtle (available in browser and Node 15+).
 *
 * The fingerprint includes the full `clip.operations` array so that any
 * new operation type (color_grade, lut, etc.) automatically invalidates
 * affected segments without rendering code changes.
 */

import type { RenderProfile } from '../types'
import type { RenderSegment } from './segmenter'

/**
 * Build the plaintext input for fingerprinting a segment.
 * Deterministic string representation of all inputs that affect the segment output.
 */
export function buildFingerprintInput(segment: RenderSegment, profile: RenderProfile): string {
  const parts: string[] = [
    `seg:${segment.index}`,
    `range:${segment.startTime.toFixed(6)}-${segment.endTime.toFixed(6)}`,
    `profile:${profile.container}|${profile.videoCodec}|${profile.resolution.width}x${profile.resolution.height}|${profile.fps}|${profile.qualityPreset}|${profile.includeAudio}|${profile.audioBitrate}`,
  ]

  for (const ref of segment.clips) {
    parts.push(
      `clip:${ref.clip.sourceId}|${ref.clip.in.toFixed(6)}|${ref.clip.out.toFixed(6)}|${(ref.clip.offset ?? 0).toFixed(6)}|${JSON.stringify(ref.clip.operations ?? [])}`,
    )
  }

  return parts.join('\n')
}

/**
 * Compute a SHA-256 fingerprint from the given input string.
 * Returns a hex-encoded hash.
 */
export async function computeFingerprint(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
