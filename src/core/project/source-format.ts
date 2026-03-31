/**
 * .source and .folder file format serialization/parsing — pure functions.
 * No browser or filesystem dependencies.
 */

import type { SourceMetadata } from '../types'

// ── .source format ──

/** Serialize a SourceMetadata to the .source text format */
export function serializeSource(meta: SourceMetadata): string {
  return [
    `id=${meta.id}`,
    `name=${meta.name}`,
    `size=${meta.size}`,
    `type=${meta.type}`,
    `added=${meta.added}`,
    `path=${meta.path}`,
  ].join('\n')
}

/** Parse a .source text file into SourceMetadata, or null if invalid */
export function parseSource(text: string): SourceMetadata | null {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) {
      map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
    }
  }

  const id = map.get('id')
  const name = map.get('name')
  if (!id || !name) return null

  return {
    id,
    name,
    size: Number(map.get('size') || '0'),
    type: map.get('type') || 'video/mp4',
    added: map.get('added') || new Date().toISOString(),
    path: map.get('path') || '',
  }
}

// ── .folder marker format ──

/** Serialize a folder marker to its text format */
export function serializeFolder(name: string, path: string): string {
  return [`name=${name}`, `path=${path}`].join('\n')
}

/** Parse a .folder marker text file */
export function parseFolder(text: string): { name: string; path: string } | null {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) {
      map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim())
    }
  }
  const name = map.get('name')
  if (!name) return null
  return { name, path: map.get('path') || '' }
}
