/**
 * Filesystem operations on the project directory and .sources/ subfolder.
 * Uses the File System Access API (Chromium only).
 */

import type { SourceMetadata, FileNode } from './types'

const SOURCES_DIR = '.sources'

// ── Directory operations ──

export async function ensureSourcesDir(
  projectHandle: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle> {
  return projectHandle.getDirectoryHandle(SOURCES_DIR, { create: true })
}

export async function hasSourcesDir(
  projectHandle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    await projectHandle.getDirectoryHandle(SOURCES_DIR)
    return true
  } catch {
    return false
  }
}

// ── .source file format ──

function serializeSource(meta: SourceMetadata): string {
  return [
    `id=${meta.id}`,
    `name=${meta.name}`,
    `size=${meta.size}`,
    `type=${meta.type}`,
    `added=${meta.added}`,
    `path=${meta.path}`,
  ].join('\n')
}

function parseSource(text: string): SourceMetadata | null {
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

function serializeFolder(name: string, path: string): string {
  return [`name=${name}`, `path=${path}`].join('\n')
}

function parseFolder(text: string): { name: string; path: string } | null {
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

// ── CRUD operations ──

export async function writeSourceFile(
  sourcesDir: FileSystemDirectoryHandle,
  meta: SourceMetadata
): Promise<void> {
  const fileHandle = await sourcesDir.getFileHandle(`${meta.id}.source`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(serializeSource(meta))
  await writable.close()
}

export async function deleteSourceFile(
  sourcesDir: FileSystemDirectoryHandle,
  sourceId: string
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
  path: string
): Promise<void> {
  const fileHandle = await sourcesDir.getFileHandle(`${folderId}.folder`, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(serializeFolder(name, path))
  await writable.close()
}

export async function deleteFolderMarker(
  sourcesDir: FileSystemDirectoryHandle,
  folderId: string
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
  newPath: string
): Promise<void> {
  // Read existing
  const fileHandle = await sourcesDir.getFileHandle(`${sourceId}.source`)
  const file = await fileHandle.getFile()
  const text = await file.text()
  const meta = parseSource(text)
  if (!meta) return

  // Update path and rewrite
  meta.path = newPath
  const writable = await fileHandle.createWritable()
  await writable.write(serializeSource(meta))
  await writable.close()
}

// ── Read all sources ──

export async function readAllSources(
  sourcesDir: FileSystemDirectoryHandle
): Promise<{ sources: SourceMetadata[]; folders: { id: string; name: string; path: string }[] }> {
  const sources: SourceMetadata[] = []
  const folders: { id: string; name: string; path: string }[] = []

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

  return { sources, folders }
}

// ── Build tree from flat sources ──

export function buildTreeFromSources(
  sources: SourceMetadata[],
  folders: { id: string; name: string; path: string }[],
  handleMap: Map<string, FileSystemFileHandle>
): FileNode[] {
  const root: FileNode[] = []

  // Helper: ensures a nested folder path exists and returns the children array
  const folderCache = new Map<string, FileNode>()

  function ensureFolderPath(fullPath: string): FileNode[] {
    if (!fullPath) return root

    if (folderCache.has(fullPath)) {
      return folderCache.get(fullPath)!.children!
    }

    const parts = fullPath.split('/')
    let current = root
    let builtPath = ''

    for (const part of parts) {
      builtPath = builtPath ? `${builtPath}/${part}` : part
      if (folderCache.has(builtPath)) {
        current = folderCache.get(builtPath)!.children!
      } else {
        const folder: FileNode = {
          id: `folder-${builtPath}`,
          name: part,
          type: 'folder',
          children: [],
          expanded: true,
          path: builtPath,
        }
        current.push(folder)
        folderCache.set(builtPath, folder)
        current = folder.children!
      }
    }
    return current
  }

  // First, create all explicit folder markers (so empty folders appear)
  for (const f of folders) {
    const parentPath = f.path
    const fullPath = parentPath ? `${parentPath}/${f.name}` : f.name
    const parent = ensureFolderPath(parentPath)

    if (!folderCache.has(fullPath)) {
      const folder: FileNode = {
        id: f.id,
        name: f.name,
        type: 'folder',
        children: [],
        expanded: true,
        path: fullPath,
      }
      parent.push(folder)
      folderCache.set(fullPath, folder)
    } else {
      // Update ID to use the marker's ID
      const existing = folderCache.get(fullPath)!
      existing.id = f.id
    }
  }

  // Then, place each file in its folder
  for (const src of sources) {
    const parent = ensureFolderPath(src.path)
    const handle = handleMap.get(src.id)

    const fileNode: FileNode = {
      id: src.id,
      name: src.name,
      type: 'file',
      sourceId: src.id,
      handle,
      size: src.size,
      mimeType: src.type,
      added: src.added,
      path: src.path,
      permissionState: handle ? 'prompt' : 'denied',
    }
    parent.push(fileNode)
  }

  // Sort: folders first, then files, alphabetically
  function sortTree(nodes: FileNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children) sortTree(node.children)
    }
  }
  sortTree(root)

  return root
}
