/**
 * Filesystem operations on the project directory and sources/ subfolder.
 * Uses the File System Access API (Chromium only).
 *
 * Format parsing/serialization is delegated to core/project modules.
 * This file only handles the browser FS I/O layer.
 */

import type { SourceMetadata, TimelineDocument, TimelineSourceMeta, FolderMeta, ProjectFile } from '../core/types'
import { serializeSource, parseSource, serializeFolder, parseFolder } from '../core/project/source-format'
import { serializeTimeline, parseTimeline } from '../core/project/timeline-format'

// Re-export core functions that the store uses
export { buildTreeFromSources } from '../core/project/tree-builder'
export { serializeTimeline, parseTimeline }

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
    const doc = parseTimeline(text)
    if (doc) {
      // Name is derived from filename, not stored inside YAML
      doc.name = timelineId
    }
    return doc
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

// ── Read all sources ──

/** Directories to skip when scanning the project for files */
const SKIP_DIRS = new Set(['sources', 'node_modules', '.git'])

export async function readAllSources(
  sourcesDir: FileSystemDirectoryHandle,
  projectDir: FileSystemDirectoryHandle,
): Promise<{
  sources: SourceMetadata[]
  folders: FolderMeta[]
  timelines: TimelineSourceMeta[]
  projectFiles: ProjectFile[]
}> {
  const sources: SourceMetadata[] = []
  const folders: FolderMeta[] = []
  const timelines: TimelineSourceMeta[] = []
  const projectFiles: ProjectFile[] = []

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

  // Collect names of files already tracked by .source metadata for deduplication.
  // Use full relative paths (path/name) when path is available, plus bare names as fallback.
  const trackedNames = new Set<string>()
  for (const s of sources) {
    trackedNames.add(s.name)
    if (s.path) trackedNames.add(`${s.path}/${s.name}`)
  }

  // Read .timeline files from project root directory
  for await (const entry of projectDir.values()) {
    if (entry.kind !== 'file') continue
    if (!entry.name.endsWith('.timeline')) continue
    const fileHandle = entry as FileSystemFileHandle
    const file = await fileHandle.getFile()
    const text = await file.text()
    const doc = parseTimeline(text)
    if (doc) {
      const id = entry.name.replace('.timeline', '')
      timelines.push({
        id,
        name: id,
        path: '',
        created: doc.created,
      })
    }
  }

  // Scan the project directory recursively for actual media/video files
  // that are not tracked by .source metadata
  async function scanDir(dir: FileSystemDirectoryHandle, relativePath: string): Promise<void> {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        const childDir = await dir.getDirectoryHandle(entry.name)
        const childPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
        await scanDir(childDir, childPath)
      } else if (entry.kind === 'file') {
        // Skip timeline files (already handled above) and hidden files
        if (entry.name.endsWith('.timeline') || entry.name.startsWith('.')) continue
        // Use relative path + filename as stable ID
        const fullRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
        // Skip files already tracked by .source metadata (check both name and full path)
        if (trackedNames.has(entry.name) || trackedNames.has(fullRelPath)) continue

        const fileHandle = entry as FileSystemFileHandle
        const file = await fileHandle.getFile()
        projectFiles.push({
          id: `project:${fullRelPath}`,
          name: entry.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          path: relativePath,
          handle: fileHandle,
        })
      }
    }
  }

  await scanDir(projectDir, '')

  return { sources, folders, timelines, projectFiles }
}
