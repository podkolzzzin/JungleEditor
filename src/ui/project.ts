/**
 * Filesystem operations on the project directory and sources/ subfolder.
 * Uses the File System Access API (Chromium only).
 *
 * Format parsing/serialization is delegated to core/project modules.
 * This file only handles the browser FS I/O layer.
 */

import type { SourceMetadata, TimelineDocument, TimelineSourceMeta, FolderMeta, RenderDocument } from '../core/types'
import { serializeSource, parseSource, serializeFolder, parseFolder } from '../core/project/source-format'
import { serializeTimeline, parseTimeline } from '../core/project/timeline-format'
import { serializeRender, parseRender } from '../core/project/render-format'
import type { RenderSourceMeta } from '../core/project/tree-builder'

// Re-export core functions that the store uses
export { buildTreeFromSources } from '../core/project/tree-builder'
export type { RenderSourceMeta } from '../core/project/tree-builder'
export { serializeTimeline, parseTimeline }
export { serializeRender, parseRender }

const SOURCES_DIR = 'sources'

// ── Directory operations ──

export async function ensureSourcesDir(
  projectHandle: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return projectHandle.getDirectoryHandle(SOURCES_DIR, { create: true })
}

export async function hasSourcesDir(
  projectHandle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    await projectHandle.getDirectoryHandle(SOURCES_DIR)
    return true
  } catch {
    return false
  }
}

// ── CRUD operations ──

export async function writeSourceFile(
  sourcesDir: FileSystemDirectoryHandle,
  meta: SourceMetadata,
): Promise<void> {
  const fileHandle = await sourcesDir.getFileHandle(`${meta.id}.source`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(serializeSource(meta))
  await writable.close()
}

export async function deleteSourceFile(
  sourcesDir: FileSystemDirectoryHandle,
  sourceId: string,
): Promise<void> {
  try {
    await sourcesDir.removeEntry(`${sourceId}.source`)
  } catch {
    // File may not exist
  }
}

export async function writeFolderMarker(
  sourcesDir: FileSystemDirectoryHandle,
  folderId: string,
  name: string,
  path: string,
): Promise<void> {
  const fileHandle = await sourcesDir.getFileHandle(`${folderId}.folder`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(serializeFolder(name, path))
  await writable.close()
}

export async function deleteFolderMarker(
  sourcesDir: FileSystemDirectoryHandle,
  folderId: string,
): Promise<void> {
  try {
    await sourcesDir.removeEntry(`${folderId}.folder`)
  } catch {
    // May not exist
  }
}

export async function updateSourcePath(
  sourcesDir: FileSystemDirectoryHandle,
  sourceId: string,
  newPath: string,
): Promise<void> {
  const fileHandle = await sourcesDir.getFileHandle(`${sourceId}.source`)
  const file = await fileHandle.getFile()
  const text = await file.text()
  const meta = parseSource(text)
  if (!meta) return

  meta.path = newPath
  const writable = await fileHandle.createWritable()
  await writable.write(serializeSource(meta))
  await writable.close()
}

// ── .timeline file operations (stored in project root, not sources/) ──

export async function writeTimelineFile(
  projectDir: FileSystemDirectoryHandle,
  timelineId: string,
  doc: TimelineDocument,
): Promise<void> {
  doc.modified = new Date().toISOString()
  const fileHandle = await projectDir.getFileHandle(`${timelineId}.timeline`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(serializeTimeline(doc))
  await writable.close()
}

export async function readTimelineFile(
  projectDir: FileSystemDirectoryHandle,
  timelineId: string,
): Promise<TimelineDocument | null> {
  try {
    const fileHandle = await projectDir.getFileHandle(`${timelineId}.timeline`)
    const file = await fileHandle.getFile()
    const text = await file.text()
    return parseTimeline(text)
  } catch {
    return null
  }
}

export async function deleteTimelineFile(
  projectDir: FileSystemDirectoryHandle,
  timelineId: string,
): Promise<void> {
  try {
    await projectDir.removeEntry(`${timelineId}.timeline`)
  } catch {
    // File may not exist
  }
}

// ── .render file operations (stored in project root) ──

export async function writeRenderFile(
  projectDir: FileSystemDirectoryHandle,
  renderId: string,
  doc: RenderDocument,
): Promise<void> {
  doc.modified = new Date().toISOString()
  const fileHandle = await projectDir.getFileHandle(`${renderId}.render`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(serializeRender(doc))
  await writable.close()
}

export async function readRenderFile(
  projectDir: FileSystemDirectoryHandle,
  renderId: string,
): Promise<RenderDocument | null> {
  try {
    const fileHandle = await projectDir.getFileHandle(`${renderId}.render`)
    const file = await fileHandle.getFile()
    const text = await file.text()
    return parseRender(text)
  } catch {
    return null
  }
}

export async function deleteRenderFile(
  projectDir: FileSystemDirectoryHandle,
  renderId: string,
): Promise<void> {
  try {
    await projectDir.removeEntry(`${renderId}.render`)
  } catch {
    // File may not exist
  }
}

// ── Read all sources ──

export async function readAllSources(
  sourcesDir: FileSystemDirectoryHandle,
  projectDir: FileSystemDirectoryHandle,
): Promise<{
  sources: SourceMetadata[]
  folders: FolderMeta[]
  timelines: TimelineSourceMeta[]
  renders: RenderSourceMeta[]
}> {
  const sources: SourceMetadata[] = []
  const folders: FolderMeta[] = []
  const timelines: TimelineSourceMeta[] = []
  const renders: RenderSourceMeta[] = []

  // Read .source and .folder files from sources/ directory
  for await (const entry of sourcesDir.values()) {
    if (entry.kind !== 'file') continue
    const fileHandle = entry as FileSystemFileHandle

    if (entry.name.endsWith('.source')) {
      const file = await fileHandle.getFile()
      const text = await file.text()
      const meta = parseSource(text)
      if (meta) sources.push(meta)
    } else if (entry.name.endsWith('.folder')) {
      const file = await fileHandle.getFile()
      const text = await file.text()
      const parsed = parseFolder(text)
      if (parsed) {
        const id = entry.name.replace('.folder', '')
        folders.push({ id, ...parsed })
      }
    }
  }

  // Read .timeline and .render files from project root directory
  for await (const entry of projectDir.values()) {
    if (entry.kind !== 'file') continue

    if (entry.name.endsWith('.timeline')) {
      const fileHandle = entry as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const text = await file.text()
      const doc = parseTimeline(text)
      if (doc) {
        const id = entry.name.replace('.timeline', '')
        timelines.push({
          id,
          name: doc.name || entry.name,
          path: '',
          created: doc.created,
        })
      }
    } else if (entry.name.endsWith('.render')) {
      const fileHandle = entry as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const text = await file.text()
      const doc = parseRender(text)
      if (doc) {
        const id = entry.name.replace('.render', '')
        renders.push({
          id,
          name: doc.name || entry.name,
          timelineId: doc.timelineId,
          timelineName: doc.timelineName,
          path: '',
          created: doc.created,
        })
      }
    }
  }

  return { sources, folders, timelines, renders }
}
