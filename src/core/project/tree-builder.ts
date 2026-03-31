/**
 * Build a file tree from flat source/folder/timeline metadata — pure function.
 * No browser, filesystem, or UI dependencies.
 */

import type { FileNode, SourceMetadata, TimelineSourceMeta, FolderMeta } from '../types'

/** Metadata stored alongside a render profile in sources/ for tree placement */
export interface RenderSourceMeta {
  id: string
  name: string
  timelineId: string
  timelineName: string
  path: string
  created: string
}

/**
 * Build a hierarchical FileNode tree from flat lists of sources, folders, and timelines.
 * The handleMap provides platform-specific file handles (keyed by sourceId).
 */
export function buildTreeFromSources(
  sources: SourceMetadata[],
  folders: FolderMeta[],
  handleMap: Map<string, unknown>,
  timelines: TimelineSourceMeta[] = [],
  renders: RenderSourceMeta[] = [],
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

  // Place timeline files in the tree
  for (const tl of timelines) {
    const parent = ensureFolderPath(tl.path)
    const timelineNode: FileNode = {
      id: tl.id,
      name: `${tl.name}.timeline`,
      type: 'file',
      sourceId: tl.id,
      path: tl.path,
      mimeType: 'application/x-timeline',
      added: tl.created,
      permissionState: 'granted',
    }
    parent.push(timelineNode)
  }

  // Place render profile files in the tree (nested under their parent timeline)
  for (const rd of renders) {
    const parent = ensureFolderPath(rd.path)
    const renderNode: FileNode = {
      id: rd.id,
      name: `${rd.name}.render`,
      type: 'file',
      sourceId: rd.id,
      path: rd.path,
      mimeType: 'application/x-render',
      added: rd.created,
      permissionState: 'granted',
    }
    parent.push(renderNode)
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
