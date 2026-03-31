/**
 * Central reactive store for the Jungle Editor application.
 * Manages project state, file tree, and all user actions.
 */

import { reactive, ref } from 'vue'
import type { FileNode, SourceMetadata } from './types'
import {
  saveProjectHandle,
  loadProjectHandle,
  saveFileHandle,
  loadAllFileHandles,
  removeFileHandle,
  clearAll as clearDB,
} from './persistence'
import {
  ensureSourcesDir,
  readAllSources,
  buildTreeFromSources,
  writeSourceFile,
  deleteSourceFile,
  writeFolderMarker,
  deleteFolderMarker,
} from './project'

// ── Reactive state ──

export const fileTree = reactive<FileNode[]>([])
export const activeFile = ref<FileNode | null>(null)
export const sidebarOpen = ref(true)
export const projectHandle = ref<FileSystemDirectoryHandle | null>(null)
export const projectName = ref('')
export const sourcesDir = ref<FileSystemDirectoryHandle | null>(null)
export const loading = ref(true)
export const hasProject = ref(false)
export const fileCount = ref(0)

// ── Initialization ──

/**
 * Try to resume the last opened project from IndexedDB.
 * If the handle is found and permission is granted, load the tree.
 * Otherwise, show the landing screen.
 */
export async function initFromStorage(): Promise<void> {
  loading.value = true
  try {
    const handle = await loadProjectHandle()
    if (!handle) {
      loading.value = false
      return
    }

    // Check if we still have permission
    const perm = await handle.requestPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      loading.value = false
      return
    }

    await loadProject(handle)
  } catch (e) {
    console.warn('Could not restore project:', e)
  }
  loading.value = false
}

/**
 * User action: create a new project by picking/creating an empty directory.
 */
export async function createProject(): Promise<void> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    await saveProjectHandle(handle)
    await loadProject(handle)
  } catch (e: any) {
    if (e.name === 'AbortError') return
    console.error('Failed to create project:', e)
  }
}

/**
 * User action: open an existing project directory.
 */
export async function openProject(): Promise<void> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    await saveProjectHandle(handle)
    await loadProject(handle)
  } catch (e: any) {
    if (e.name === 'AbortError') return
    console.error('Failed to open project:', e)
  }
}

/**
 * Internal: load a project from a directory handle.
 */
async function loadProject(handle: FileSystemDirectoryHandle): Promise<void> {
  projectHandle.value = handle
  projectName.value = handle.name

  const sd = await ensureSourcesDir(handle)
  sourcesDir.value = sd

  // Read .sources/ and IndexedDB handles
  const { sources, folders } = await readAllSources(sd)
  const handleMap = await loadAllFileHandles()

  // Build tree
  const tree = buildTreeFromSources(sources, folders, handleMap)
  fileTree.splice(0, fileTree.length, ...tree)
  fileCount.value = sources.length

  activeFile.value = null
  hasProject.value = true
}

/**
 * User action: close the current project and return to landing screen.
 */
export async function closeProject(): Promise<void> {
  // Revoke all blob URLs
  revokeAllUrls(fileTree)

  fileTree.splice(0, fileTree.length)
  activeFile.value = null
  projectHandle.value = null
  projectName.value = ''
  sourcesDir.value = null
  hasProject.value = false
  fileCount.value = 0

  await clearDB()
}

function revokeAllUrls(nodes: FileNode[]) {
  for (const n of nodes) {
    if (n.url) {
      URL.revokeObjectURL(n.url)
      n.url = undefined
    }
    if (n.children) revokeAllUrls(n.children)
  }
}

// ── File operations ──

/**
 * Add video files using showOpenFilePicker (for persistent handles).
 * Files are added to the currently selected folder or root.
 */
export async function addVideoFiles(targetFolder?: FileNode): Promise<void> {
  if (!sourcesDir.value) return

  let handles: FileSystemFileHandle[]
  try {
    handles = await (window as any).showOpenFilePicker({
      multiple: true,
      types: [
        {
          description: 'Video files',
          accept: {
            'video/*': ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.ogg'],
          },
        },
      ],
    })
  } catch (e: any) {
    if (e.name === 'AbortError') return
    throw e
  }

  const targetPath = targetFolder?.path || ''
  const targetChildren = targetFolder?.children ?? fileTree

  for (const handle of handles) {
    const file = await handle.getFile()
    const sourceId = crypto.randomUUID()

    // Write .source file
    const meta: SourceMetadata = {
      id: sourceId,
      name: file.name,
      size: file.size,
      type: file.type || 'video/mp4',
      added: new Date().toISOString(),
      path: targetPath,
    }
    await writeSourceFile(sourcesDir.value, meta)

    // Save handle to IndexedDB
    await saveFileHandle(sourceId, handle)

    // Create blob URL
    const url = URL.createObjectURL(file)

    // Add to reactive tree
    const fileNode: FileNode = {
      id: sourceId,
      name: file.name,
      type: 'file',
      sourceId,
      handle,
      url,
      size: file.size,
      mimeType: meta.type,
      added: meta.added,
      path: targetPath,
      permissionState: 'granted',
    }
    targetChildren.push(fileNode)
    fileCount.value++
  }
}

/**
 * Remove a node (file or folder) from the tree.
 */
export async function removeNode(nodeId: string, list: FileNode[] = fileTree): Promise<boolean> {
  const idx = list.findIndex((n) => n.id === nodeId)
  if (idx !== -1) {
    const node = list[idx]
    await cleanupNode(node)
    list.splice(idx, 1)
    if (activeFile.value?.id === nodeId) activeFile.value = null
    return true
  }
  for (const n of list) {
    if (n.children && (await removeNode(nodeId, n.children))) return true
  }
  return false
}

async function cleanupNode(node: FileNode): Promise<void> {
  if (node.type === 'file') {
    if (node.url) URL.revokeObjectURL(node.url)
    if (node.sourceId && sourcesDir.value) {
      await deleteSourceFile(sourcesDir.value, node.sourceId).catch(() => {})
      await removeFileHandle(node.sourceId).catch(() => {})
      fileCount.value = Math.max(0, fileCount.value - 1)
    }
  } else if (node.type === 'folder') {
    // Remove folder marker
    if (sourcesDir.value) {
      await deleteFolderMarker(sourcesDir.value, node.id).catch(() => {})
    }
    // Recursively clean children
    if (node.children) {
      for (const child of node.children) {
        await cleanupNode(child)
      }
    }
  }
}

// ── Folder operations ──

export async function addFolder(name: string, parentFolder?: FileNode): Promise<void> {
  if (!sourcesDir.value) return

  const parentPath = parentFolder?.path || ''
  const fullPath = parentPath ? `${parentPath}/${name}` : name
  const folderId = crypto.randomUUID()

  // Write .folder marker
  await writeFolderMarker(sourcesDir.value, folderId, name, parentPath)

  const folder: FileNode = {
    id: folderId,
    name,
    type: 'folder',
    children: [],
    expanded: true,
    path: fullPath,
  }

  const target = parentFolder?.children ?? fileTree
  target.push(folder)
}

export function toggleFolder(node: FileNode): void {
  if (node.type === 'folder') {
    node.expanded = !node.expanded
  }
}

// ── File selection & permission resolution ──

export async function selectFile(node: FileNode): Promise<void> {
  if (node.type !== 'file') return
  activeFile.value = node

  if (!node.url && node.handle) {
    await resolveFileUrl(node)
  }
}

export async function resolveFileUrl(node: FileNode): Promise<string | null> {
  if (node.url) return node.url
  if (!node.handle) {
    node.permissionState = 'denied'
    return null
  }

  try {
    const perm = await node.handle.requestPermission({ mode: 'read' })
    if (perm !== 'granted') {
      node.permissionState = 'denied'
      return null
    }
    const file = await node.handle.getFile()
    const url = URL.createObjectURL(file)
    node.url = url
    node.permissionState = 'granted'
    return url
  } catch (e) {
    console.warn('Could not access file:', node.name, e)
    node.permissionState = 'denied'
    return null
  }
}

// ── Helper: find a node by ID ──

export function findNode(nodeId: string, list: FileNode[] = fileTree): FileNode | null {
  for (const n of list) {
    if (n.id === nodeId) return n
    if (n.children) {
      const found = findNode(nodeId, n.children)
      if (found) return found
    }
  }
  return null
}

// ── Helper: get the currently selected folder for adding files ──

export function getSelectedFolder(): FileNode | undefined {
  if (!activeFile.value) return undefined
  if (activeFile.value.type === 'folder') return activeFile.value
  // If a file is selected, find its parent folder by path
  if (activeFile.value.path) {
    return findFolderByPath(activeFile.value.path)
  }
  return undefined
}

function findFolderByPath(path: string, list: FileNode[] = fileTree): FileNode | undefined {
  for (const n of list) {
    if (n.type === 'folder' && n.path === path) return n
    if (n.children) {
      const found = findFolderByPath(path, n.children)
      if (found) return found
    }
  }
  return undefined
}
