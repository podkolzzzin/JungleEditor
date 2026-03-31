/**
 * Central reactive store for the Jungle Editor application.
 * Manages project state, file tree, and all user actions.
 */

import { reactive, ref } from 'vue'
import type { FileNode, SourceMetadata, TimelineDocument, BackgroundTask, RenderDocument } from '../core/types'
import { isTimelineNode as _isTimelineNode, isRenderNode as _isRenderNode, findNodeById } from '../core/types'
import {
  saveFileHandle,
  loadAllFileHandles,
  removeFileHandle,
  clearAll as clearHandleCache,
} from './persistence'
import {
  ensureSourcesDir,
  readAllSources,
  buildTreeFromSources,
  writeSourceFile,
  deleteSourceFile,
  writeFolderMarker,
  deleteFolderMarker,
  writeTimelineFile,
  readTimelineFile,
  deleteTimelineFile,
  writeRenderFile,
  readRenderFile,
  deleteRenderFile,
} from './project'

// ── Tab / pane types ──

/** A single open file tab (may be timeline, video, or render). */
export interface OpenTab {
  id: string
  fileNodeId: string
  title: string
  fileType: 'timeline' | 'video' | 'render'
  timelineDoc: TimelineDocument | null
  dirty: boolean
}

/** A leaf pane holds an ordered list of tabs with one active. */
export interface LeafPane {
  type: 'leaf'
  id: string
  tabIds: string[]
  activeTabId: string | null
}

/** A split pane contains two child pane nodes arranged horizontally or vertically. */
export interface SplitPane {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  /** Fraction of total space given to `first` child (0.1 – 0.9). */
  ratio: number
  first: PaneLayout
  second: PaneLayout
}

export type PaneLayout = LeafPane | SplitPane

// ── Reactive state ──

export const fileTree = reactive<FileNode[]>([])
export const activeFile = ref<FileNode | null>(null)
export const activeTimeline = ref<TimelineDocument | null>(null)
export const sidebarOpen = ref(true)
export const projectHandle = ref<FileSystemDirectoryHandle | null>(null)
export const projectName = ref('')
export const sourcesDir = ref<FileSystemDirectoryHandle | null>(null)
export const loading = ref(true)
export const hasProject = ref(false)
export const fileCount = ref(0)
export const unlinkedCount = ref(0)

// ── Background tasks & render state ──

export const backgroundTasks = reactive<BackgroundTask[]>([])
export const activeRender = ref<RenderDocument | null>(null)

// ── Tab / pane state ──

export const openTabs = reactive<Map<string, OpenTab>>(new Map())

function makeLeafPane(id: string): LeafPane {
  return { type: 'leaf', id, tabIds: [], activeTabId: null }
}

export const paneLayout = ref<PaneLayout>(makeLeafPane('pane-main'))
export const focusedPaneId = ref<string>('pane-main')

/** Set while a tab is being dragged — used to show split drop zones. */
export const tabDragState = ref<{ tabId: string; fromPaneId: string } | null>(null)

// ── Pane tree helpers ──

export function findPaneById(layout: PaneLayout, id: string): PaneLayout | null {
  if (layout.id === id) return layout
  if (layout.type === 'split') {
    return findPaneById(layout.first, id) ?? findPaneById(layout.second, id)
  }
  return null
}

function findParentSplit(layout: PaneLayout, id: string): SplitPane | null {
  if (layout.type !== 'split') return null
  if (layout.first.id === id || layout.second.id === id) return layout
  return findParentSplit(layout.first, id) ?? findParentSplit(layout.second, id)
}

export function getAllLeafPanes(layout: PaneLayout): LeafPane[] {
  if (layout.type === 'leaf') return [layout]
  return [...getAllLeafPanes(layout.first), ...getAllLeafPanes(layout.second)]
}

function findLeafPaneWithTab(layout: PaneLayout, tabId: string): LeafPane | null {
  if (layout.type === 'leaf') return layout.tabIds.includes(tabId) ? layout : null
  return findLeafPaneWithTab(layout.first, tabId) ?? findLeafPaneWithTab(layout.second, tabId)
}

function replacePaneInLayout(layout: PaneLayout, targetId: string, replacement: PaneLayout): boolean {
  if (layout.type !== 'split') return false
  if (layout.first.id === targetId) { layout.first = replacement; return true }
  if (layout.second.id === targetId) { layout.second = replacement; return true }
  return replacePaneInLayout(layout.first, targetId, replacement) ||
    replacePaneInLayout(layout.second, targetId, replacement)
}

export function getActivePaneTab(paneId: string): OpenTab | null {
  const pane = findPaneById(paneLayout.value, paneId)
  if (!pane || pane.type !== 'leaf' || !pane.activeTabId) return null
  return openTabs.get(pane.activeTabId) ?? null
}

/** Sync legacy activeFile / activeTimeline to the focused pane's active tab. */
function syncActiveRefs(): void {
  const tab = getActivePaneTab(focusedPaneId.value)
  if (!tab) {
    activeFile.value = null
    activeTimeline.value = null
    return
  }
  const node = findNode(tab.fileNodeId)
  activeFile.value = node
  activeTimeline.value = tab.timelineDoc
}

// ── Tab management ──

/**
 * Open a file in a new tab (or activate an existing one).
 * This is the primary entry point replacing the old selectFile().
 */
export async function openFileInTab(node: FileNode, targetPaneId?: string): Promise<void> {
  if (node.type !== 'file') return

  const paneId = targetPaneId ?? focusedPaneId.value

  // If already open anywhere, activate that tab
  for (const [tabId, tab] of openTabs) {
    if (tab.fileNodeId === node.id) {
      const pane = findLeafPaneWithTab(paneLayout.value, tabId)
      if (pane) {
        pane.activeTabId = tabId
        focusedPaneId.value = pane.id
        syncActiveRefs()
        return
      }
    }
  }

  // Create a new tab
  const tabId = `tab-${crypto.randomUUID().slice(0, 8)}`
  const isTimeline = isTimelineNode(node)
  const isRender = isRenderNode(node)
  const tab: OpenTab = {
    id: tabId,
    fileNodeId: node.id,
    title: node.name,
    fileType: isTimeline ? 'timeline' : isRender ? 'render' : 'video',
    timelineDoc: null,
    dirty: false,
  }

  if (isTimeline && projectHandle.value && node.sourceId) {
    try {
      tab.timelineDoc = await readTimelineFile(projectHandle.value, node.sourceId)
    } catch (e) {
      console.error(`Failed to load timeline "${node.name}":`, e)
      // Tab is created with null timelineDoc; TimelineEditor shows nothing
    }
  } else if (isRender && projectHandle.value && node.sourceId) {
    try {
      activeRender.value = await readRenderFile(projectHandle.value, node.sourceId)
    } catch (e) {
      console.error(`Failed to load render profile "${node.name}":`, e)
    }
  } else if (!isTimeline && !isRender && !node.url && node.handle) {
    await resolveFileUrl(node)
  }

  openTabs.set(tabId, tab)

  // Add tab to target pane
  const targetPane = findPaneById(paneLayout.value, paneId)
  if (targetPane && targetPane.type === 'leaf') {
    targetPane.tabIds.push(tabId)
    targetPane.activeTabId = tabId
    focusedPaneId.value = paneId
  }

  syncActiveRefs()
}

/** Activate (focus) a tab within a given pane. */
export function activateTab(tabId: string, paneId: string): void {
  const pane = findPaneById(paneLayout.value, paneId)
  if (!pane || pane.type !== 'leaf' || !pane.tabIds.includes(tabId)) return
  pane.activeTabId = tabId
  focusedPaneId.value = paneId
  syncActiveRefs()
}

/** Close a tab. Collapses the pane if it becomes empty (unless it's the last one). */
export function closeTab(tabId: string): void {
  const pane = findLeafPaneWithTab(paneLayout.value, tabId)
  if (!pane) { openTabs.delete(tabId); return }

  const idx = pane.tabIds.indexOf(tabId)
  pane.tabIds.splice(idx, 1)
  openTabs.delete(tabId)

  if (pane.activeTabId === tabId) {
    pane.activeTabId = pane.tabIds.length > 0
      ? pane.tabIds[Math.min(idx, pane.tabIds.length - 1)]
      : null
  }

  // Collapse the pane if empty and not the only pane
  if (pane.tabIds.length === 0 && paneLayout.value.id !== pane.id) {
    _closePaneIfEmpty(pane.id)
  }

  if (focusedPaneId.value === pane.id) syncActiveRefs()
}

function _closePaneIfEmpty(paneId: string): void {
  const pane = findPaneById(paneLayout.value, paneId)
  if (!pane || pane.type !== 'leaf' || pane.tabIds.length > 0) return
  if (paneLayout.value.id === paneId) return

  const parent = findParentSplit(paneLayout.value, paneId)
  if (!parent) return

  const sibling = parent.first.id === paneId ? parent.second : parent.first
  if (paneLayout.value.id === parent.id) {
    paneLayout.value = sibling
  } else {
    replacePaneInLayout(paneLayout.value, parent.id, sibling)
  }

  if (focusedPaneId.value === paneId) {
    const leaves = getAllLeafPanes(paneLayout.value)
    focusedPaneId.value = leaves[0]?.id ?? 'pane-main'
    syncActiveRefs()
  }
}

/** Reorder tabs within a pane via drag-and-drop. */
export function reorderTabsInPane(paneId: string, fromIndex: number, toIndex: number): void {
  const pane = findPaneById(paneLayout.value, paneId)
  if (!pane || pane.type !== 'leaf') return
  const [tab] = pane.tabIds.splice(fromIndex, 1)
  pane.tabIds.splice(toIndex, 0, tab)
}

/** Move a tab from one pane to another (used by split drag-and-drop). */
export function moveTabToPane(
  tabId: string,
  fromPaneId: string,
  toPaneId: string,
  toIndex?: number,
): void {
  if (fromPaneId === toPaneId) return
  const fromPane = findPaneById(paneLayout.value, fromPaneId)
  const toPane = findPaneById(paneLayout.value, toPaneId)
  if (!fromPane || fromPane.type !== 'leaf' || !toPane || toPane.type !== 'leaf') return

  const fromIdx = fromPane.tabIds.indexOf(tabId)
  if (fromIdx === -1) return
  fromPane.tabIds.splice(fromIdx, 1)
  if (fromPane.activeTabId === tabId) {
    fromPane.activeTabId = fromPane.tabIds[Math.min(fromIdx, fromPane.tabIds.length - 1)] ?? null
  }

  if (toIndex !== undefined && toIndex >= 0 && toIndex <= toPane.tabIds.length) {
    toPane.tabIds.splice(toIndex, 0, tabId)
  } else {
    toPane.tabIds.push(tabId)
  }
  toPane.activeTabId = tabId
  focusedPaneId.value = toPaneId

  if (fromPane.tabIds.length === 0 && paneLayout.value.id !== fromPane.id) {
    _closePaneIfEmpty(fromPane.id)
  }
  syncActiveRefs()
}

/**
 * Split a pane: the given tab is moved into a new sibling pane.
 * direction: 'horizontal' → left/right split; 'vertical' → top/bottom.
 */
export function splitPane(
  paneId: string,
  direction: 'horizontal' | 'vertical',
  tabId: string,
): void {
  const pane = findPaneById(paneLayout.value, paneId)
  if (!pane || pane.type !== 'leaf') return

  const fromIdx = pane.tabIds.indexOf(tabId)
  if (fromIdx !== -1) pane.tabIds.splice(fromIdx, 1)
  if (pane.activeTabId === tabId) {
    pane.activeTabId = pane.tabIds[Math.min(fromIdx, pane.tabIds.length - 1)] ?? null
  }

  const newPaneId = `pane-${crypto.randomUUID().slice(0, 8)}`
  const newPane: LeafPane = { type: 'leaf', id: newPaneId, tabIds: [tabId], activeTabId: tabId }

  const split: SplitPane = {
    type: 'split',
    id: `split-${crypto.randomUUID().slice(0, 8)}`,
    direction,
    ratio: 0.5,
    first: pane,
    second: newPane,
  }

  if (paneLayout.value.id === paneId) {
    paneLayout.value = split
  } else {
    replacePaneInLayout(paneLayout.value, paneId, split)
  }

  focusedPaneId.value = newPaneId
  syncActiveRefs()
}

/** Update the split ratio for a split pane (called by the resize handle). */
export function setSplitRatio(splitId: string, ratio: number): void {
  const node = findPaneById(paneLayout.value, splitId)
  if (node && node.type === 'split') {
    node.ratio = Math.min(0.9, Math.max(0.1, ratio))
  }
}

/** Mark a tab's dirty state (called by useTimeline when edits occur). */
export function setTabDirty(tabId: string, dirty: boolean): void {
  const tab = openTabs.get(tabId)
  if (tab) tab.dirty = dirty
}

// ── Background task management ──

export function addTask(task: BackgroundTask): void {
  backgroundTasks.push(task)
}

export function updateTask(id: string, updates: Partial<BackgroundTask>): void {
  const task = backgroundTasks.find(t => t.id === id)
  if (task) Object.assign(task, updates)
}

export function removeTask(id: string): void {
  const idx = backgroundTasks.findIndex(t => t.id === id)
  if (idx !== -1) backgroundTasks.splice(idx, 1)
}

export function getTask(id: string): BackgroundTask | undefined {
  return backgroundTasks.find(t => t.id === id)
}



// ── Initialization ──

/**
 * Initialize the app. No auto-restore — user always picks the project folder.
 */
export function initFromStorage(): void {
  loading.value = false
}


/**
 * User action: create a new project by picking/creating an empty directory.
 */
export async function createProject(): Promise<void> {
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
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

  console.log(`Loading project "${handle.name}"...`)

  // Ensure we have write permission (needed to create sources/)
  const perm = await handle.requestPermission({ mode: 'readwrite' })
  if (perm !== 'granted') {
    console.error('Write permission denied for project directory')
    projectHandle.value = null
    projectName.value = ''
    return
  }

  let sd: FileSystemDirectoryHandle
  try {
    sd = await ensureSourcesDir(handle)
  } catch (e) {
    console.error('Failed to create/open sources directory:', e)
    throw e
  }
  sourcesDir.value = sd
  console.log('sources directory ready')

  // Read sources/ metadata and in-memory handle cache
  const { sources, folders, timelines, renders } = await readAllSources(sd, handle)
  const handleMap = loadAllFileHandles()
  console.log(`Found ${sources.length} source(s), ${folders.length} folder(s), ${timelines.length} timeline(s), ${renders.length} render(s), ${handleMap.size} cached handle(s)`)

  // Build tree
  const tree = buildTreeFromSources(sources, folders, handleMap, timelines, renders)
  fileTree.splice(0, fileTree.length, ...tree)
  fileCount.value = sources.length

  // Count how many files have no handle (need re-linking after reload)
  unlinkedCount.value = countUnlinked(tree)

  // Reset tab state for fresh project
  openTabs.clear()
  paneLayout.value = makeLeafPane('pane-main')
  focusedPaneId.value = 'pane-main'
  activeFile.value = null
  activeTimeline.value = null
  hasProject.value = true
  console.log('Project loaded successfully')
}

/**
 * User action: close the current project and return to landing screen.
 */
export async function closeProject(): Promise<void> {
  // Revoke all blob URLs
  revokeAllUrls(fileTree)

  fileTree.splice(0, fileTree.length)
  activeFile.value = null
  activeTimeline.value = null
  projectHandle.value = null
  projectName.value = ''
  sourcesDir.value = null
  hasProject.value = false
  fileCount.value = 0
  unlinkedCount.value = 0

  // Clear background tasks and render state
  backgroundTasks.splice(0, backgroundTasks.length)
  activeRender.value = null

  // Clear tab system
  openTabs.clear()
  paneLayout.value = makeLeafPane('pane-main')
  focusedPaneId.value = 'pane-main'

  clearHandleCache()
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
  if (!sourcesDir.value) {
    console.error('addVideoFiles: sourcesDir is null — project not properly initialized')
    return
  }

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
    try {
      await writeSourceFile(sourcesDir.value!, meta)
      console.log(`Written .source file for "${file.name}" (${sourceId})`)
    } catch (e) {
      console.error(`Failed to write .source file for "${file.name}":`, e)
      continue
    }

    // Cache handle in memory for this session
    saveFileHandle(sourceId, handle)

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
    // Close any open tab for this node
    for (const [tabId, tab] of openTabs) {
      if (tab.fileNodeId === nodeId) {
        closeTab(tabId)
        break
      }
    }
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
    if (isTimelineNode(node)) {
      // Timeline file: delete .timeline from project root
      if (node.sourceId && projectHandle.value) {
        await deleteTimelineFile(projectHandle.value, node.sourceId).catch(() => {})
      }
      if (activeFile.value?.id === node.id) {
        activeTimeline.value = null
      }
    } else if (isRenderNode(node)) {
      // Render file: delete .render from project root
      if (node.sourceId && projectHandle.value) {
        await deleteRenderFile(projectHandle.value, node.sourceId).catch(() => {})
      }
      if (activeFile.value?.id === node.id) {
        activeRender.value = null
      }
    } else {
      if (node.url) URL.revokeObjectURL(node.url)
      if (node.sourceId && sourcesDir.value) {
        await deleteSourceFile(sourcesDir.value, node.sourceId).catch(() => {})
        removeFileHandle(node.sourceId)
        fileCount.value = Math.max(0, fileCount.value - 1)
      }
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

// ── Timeline operations ──

/**
 * Create a new .timeline file in the project.
 * Prompts for a name and creates it in the selected folder (or root).
 */
export async function createTimeline(name: string, parentFolder?: FileNode): Promise<void> {
  if (!projectHandle.value) return

  const timelineId = crypto.randomUUID()
  const now = new Date().toISOString()

  const doc: TimelineDocument = {
    name,
    created: now,
    modified: now,
    resolution: '1920x1080',
    fps: 30,
    tracks: [
      {
        name: 'Track 1',
        clips: [],
      },
    ],
  }

  await writeTimelineFile(projectHandle.value, timelineId, doc)

  const targetPath = parentFolder?.path || ''
  const targetChildren = parentFolder?.children ?? fileTree

  const node: FileNode = {
    id: timelineId,
    name: `${name}.timeline`,
    type: 'file',
    sourceId: timelineId,
    path: targetPath,
    mimeType: 'application/x-timeline',
    added: now,
    permissionState: 'granted',
  }
  targetChildren.push(node)

  // Open the new timeline in a tab
  await openFileInTab(node)
}

/**
 * Save the currently active timeline document back to disk.
 */
export async function saveTimeline(): Promise<void> {
  if (!projectHandle.value || !activeFile.value || !activeTimeline.value) return
  if (!isTimelineNode(activeFile.value)) return

  const timelineId = activeFile.value.sourceId
  if (!timelineId) return

  await writeTimelineFile(projectHandle.value, timelineId, activeTimeline.value)
  console.log(`Timeline "${activeTimeline.value.name}" saved.`)
}

export function toggleFolder(node: FileNode): void {
  if (node.type === 'folder') {
    node.expanded = !node.expanded
  }
}

// ── Render profile operations ──

/**
 * Create a new .render profile for a timeline.
 */
export async function createRenderProfile(
  timelineNode: FileNode,
  profileName: string,
): Promise<void> {
  if (!projectHandle.value) return
  if (!isTimelineNode(timelineNode)) return

  const renderId = crypto.randomUUID()
  const now = new Date().toISOString()

  const doc: RenderDocument = {
    name: profileName,
    timelineId: timelineNode.sourceId || timelineNode.id,
    timelineName: timelineNode.name.replace('.timeline', ''),
    profile: {
      name: profileName,
      container: 'mp4',
      videoCodec: 'avc1.640028',
      resolution: { width: 1920, height: 1080, label: '1080p' },
      fps: 30,
      qualityPreset: 'medium',
      includeAudio: true,
      audioBitrate: 192_000,
    },
    created: now,
    modified: now,
  }

  await writeRenderFile(projectHandle.value, renderId, doc)

  const node: FileNode = {
    id: renderId,
    name: `${profileName}.render`,
    type: 'file',
    sourceId: renderId,
    path: '',
    mimeType: 'application/x-render',
    added: now,
    permissionState: 'granted',
  }
  fileTree.push(node)

  await openFileInTab(node)
}

/**
 * Save the currently active render profile back to disk.
 */
export async function saveRenderProfile(): Promise<void> {
  if (!projectHandle.value || !activeFile.value || !activeRender.value) return
  if (!isRenderNode(activeFile.value)) return

  const renderId = activeFile.value.sourceId
  if (!renderId) return

  await writeRenderFile(projectHandle.value, renderId, activeRender.value)
  console.log(`Render profile "${activeRender.value.name}" saved.`)
}

// ── File selection & permission resolution ──

export function isTimelineNode(node: FileNode): boolean {
  return _isTimelineNode(node)
}

export function isRenderNode(node: FileNode): boolean {
  return _isRenderNode(node)
}

/** Open a file in a tab (replaces the old single-file selectFile). */
export async function selectFile(node: FileNode): Promise<void> {
  await openFileInTab(node)
}

/**
 * Save a specific timeline to disk by its source ID and document.
 * This is the low-level save used by useTimeline.
 */
export async function saveTimelineById(sourceId: string, doc: TimelineDocument): Promise<void> {
  if (!projectHandle.value) return
  await writeTimelineFile(projectHandle.value, sourceId, doc)
  console.log(`Timeline "${doc.name}" saved.`)
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
  return findNodeById(nodeId, list)
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

// ── Re-link helpers ──

/** Count file nodes in tree that have no handle (excludes timeline and render nodes, which never need handles) */
function countUnlinked(nodes: FileNode[]): number {
  let count = 0
  for (const n of nodes) {
    if (n.type === 'file' && !_isTimelineNode(n) && !_isRenderNode(n) && !n.handle) count++
    if (n.children) count += countUnlinked(n.children)
  }
  return count
}

/** Collect all file nodes from tree */
function collectFileNodes(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  for (const n of nodes) {
    if (n.type === 'file') result.push(n)
    if (n.children) result.push(...collectFileNodes(n.children))
  }
  return result
}

/**
 * Re-link a single file node: opens a file picker so the user can
 * point to the original file on disk.  The handle is cached in memory
 * and a blob URL is created for playback.
 */
export async function relinkFile(node: FileNode): Promise<void> {
  if (node.type !== 'file') return

  let handles: FileSystemFileHandle[]
  try {
    handles = await (window as any).showOpenFilePicker({
      multiple: false,
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

  if (!handles.length) return
  const handle = handles[0]

  // Update handle & blob URL
  node.handle = handle
  saveFileHandle(node.sourceId!, handle)

  const file = await handle.getFile()
  if (node.url) URL.revokeObjectURL(node.url)
  node.url = URL.createObjectURL(file)
  node.permissionState = 'granted'

  // Update name/size in .source if the picked file differs
  if (sourcesDir.value && node.sourceId) {
    const meta: SourceMetadata = {
      id: node.sourceId,
      name: file.name,
      size: file.size,
      type: file.type || node.mimeType || 'video/mp4',
      added: node.added || new Date().toISOString(),
      path: node.path || '',
    }
    node.name = file.name
    node.size = file.size
    await writeSourceFile(sourcesDir.value, meta)
  }

  unlinkedCount.value = countUnlinked(fileTree)
}

/**
 * Bulk re-link: let the user pick multiple files at once.
 * Each picked file is matched to an unlinked tree node by filename.
 * Unmatched files are silently skipped.
 */
export async function relinkAllFiles(): Promise<void> {
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

  if (!handles.length) return

  // Build a lookup: filename → unlinked nodes (there may be duplicates)
  const allFiles = collectFileNodes(fileTree)
  const unlinkedByName = new Map<string, FileNode[]>()
  for (const n of allFiles) {
    if (!n.handle) {
      const list = unlinkedByName.get(n.name) || []
      list.push(n)
      unlinkedByName.set(n.name, list)
    }
  }

  let linked = 0
  for (const handle of handles) {
    const file = await handle.getFile()
    const candidates = unlinkedByName.get(file.name)
    if (!candidates || candidates.length === 0) continue

    const node = candidates.shift()!
    if (candidates.length === 0) unlinkedByName.delete(file.name)

    node.handle = handle
    saveFileHandle(node.sourceId!, handle)

    if (node.url) URL.revokeObjectURL(node.url)
    node.url = URL.createObjectURL(file)
    node.permissionState = 'granted'
    linked++
  }

  unlinkedCount.value = countUnlinked(fileTree)
  console.log(`Re-linked ${linked} file(s), ${unlinkedCount.value} still unlinked`)
}
