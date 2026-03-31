/**
 * .render file format serialization/parsing — pure functions.
 * Uses js-yaml, no browser or filesystem dependencies.
 */

import type { RenderDocument } from '../types'
import yaml from 'js-yaml'

/** Serialize a RenderDocument to YAML string */
export function serializeRender(doc: RenderDocument): string {
  return yaml.dump(doc, { lineWidth: 120, noRefs: true, sortKeys: false })
}

/** Parse a YAML string into a RenderDocument, or null if invalid */
export function parseRender(text: string): RenderDocument | null {
  try {
    const obj = yaml.load(text) as any
    if (!obj || typeof obj !== 'object') return null
    if (!obj.profile || typeof obj.profile !== 'object') return null
    return {
      name: obj.name || 'Untitled',
      timelineId: obj.timelineId || '',
      timelineName: obj.timelineName || '',
      profile: {
        name: obj.profile.name || 'Default',
        container: obj.profile.container || 'mp4',
        videoCodec: obj.profile.videoCodec || 'avc1.640028',
        resolution: obj.profile.resolution || { width: 1920, height: 1080, label: '1080p' },
        fps: obj.profile.fps || 30,
        qualityPreset: obj.profile.qualityPreset || 'medium',
        includeAudio: obj.profile.includeAudio !== false,
        audioBitrate: obj.profile.audioBitrate || 192_000,
      },
      created: obj.created || new Date().toISOString(),
      modified: obj.modified || new Date().toISOString(),
    }
  } catch {
    return null
  }
}
