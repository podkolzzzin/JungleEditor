/**
 * Timeline YAML serialization/parsing — pure functions.
 * Uses js-yaml but no browser or filesystem dependencies.
 */

import type { TimelineDocument } from '../types'
import yaml from 'js-yaml'

/** Serialize a TimelineDocument to YAML string (name is derived from filename, not stored in YAML) */
export function serializeTimeline(doc: TimelineDocument): string {
  const { name: _, ...rest } = doc
  return yaml.dump(rest, { lineWidth: 120, noRefs: true, sortKeys: false })
}

/** Parse a YAML string into a TimelineDocument, or null if invalid. Name defaults to empty (set by caller from filename). */
export function parseTimeline(text: string): TimelineDocument | null {
  try {
    const obj = yaml.load(text) as any
    if (!obj || typeof obj !== 'object') return null
    return {
      name: obj.name || '',
      created: obj.created || new Date().toISOString(),
      modified: obj.modified || new Date().toISOString(),
      resolution: obj.resolution,
      fps: obj.fps,
      tracks: Array.isArray(obj.tracks) ? obj.tracks : [],
    }
  } catch {
    return null
  }
}
