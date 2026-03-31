<script setup lang="ts">
import { ref } from 'vue'
import type { FileNode } from '../../core/types'
import type { PendingImport } from '../store'
import { fileTree, addVideoFiles, pickVideoFiles, addFolder, closeProject, getSelectedFolder, relinkAllFiles, unlinkedCount, createTimeline } from '../store'
import FileTreeNode from './FileTreeNode.vue'

const emit = defineEmits<{
  compress: [node: FileNode]
  'pending-import': [pending: PendingImport]
}>()

const isDragging = ref(false)

async function onDrop(e: DragEvent) {
  isDragging.value = false
  if (!e.dataTransfer?.items.length) return

  // Try to get FileSystemFileHandles from the drop (Chromium)
  const handles: FileSystemFileHandle[] = []
  for (const item of Array.from(e.dataTransfer.items)) {
    if (item.kind === 'file') {
      const handle = await (item as any).getAsFileSystemHandle?.()
      if (handle && handle.kind === 'file') {
        handles.push(handle)
      }
    }
  }

  if (handles.length > 0) {
    // Use store's addVideoFiles-like logic with the handles
    const { sourcesDir, fileCount } = await import('../store')
    const { writeSourceFile } = await import('../project')
    const { saveFileHandle } = await import('../persistence')
    const targetFolder = getSelectedFolder()
    const targetPath = targetFolder?.path || ''
    const targetChildren = targetFolder?.children ?? fileTree

    for (const handle of handles) {
      const file = await handle.getFile()
      if (!file.type.startsWith('video/')) continue
      const sourceId = crypto.randomUUID()
      const meta = {
        id: sourceId,
        name: file.name,
        size: file.size,
        type: file.type || 'video/mp4',
        added: new Date().toISOString(),
        path: targetPath,
      }
      if (sourcesDir.value) {
        try {
          await writeSourceFile(sourcesDir.value, meta)
          console.log(`Written .source file for drag-dropped "${file.name}" (${sourceId})`)
        } catch (e) {
          console.error(`Failed to write .source for drag-dropped "${file.name}":`, e)
          continue
        }
      } else {
        console.error('sourcesDir is null during drag-drop — skipping .source write')
        continue
      }
      await saveFileHandle(sourceId, handle)
      const url = URL.createObjectURL(file)
      targetChildren.push({
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
      })
      fileCount.value++
    }
  }
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

async function onAddFiles() {
  const pending = await pickVideoFiles(getSelectedFolder())
  if (pending) {
    emit('pending-import', pending)
  }
}

function onCreateFolder() {
  const name = prompt('Folder name:')
  if (name?.trim()) {
    addFolder(name.trim(), getSelectedFolder())
  }
}

function onCreateTimeline() {
  const name = prompt('Timeline name:')
  if (name?.trim()) {
    createTimeline(name.trim(), getSelectedFolder())
  }
}
</script>

<template>
  <div class="file-tree-panel">
    <div class="panel-header">
      <span class="panel-title">EXPLORER</span>
      <div class="panel-actions">
        <button v-if="unlinkedCount > 0" class="panel-btn relink-btn" @click="relinkAllFiles" title="Re-link source files">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M8 3a5 5 0 00-4.546 2.914.5.5 0 01-.908-.426A6 6 0 0114 8a6 6 0 01-6 6 6 6 0 01-5.454-3.488.5.5 0 11.908-.426A5 5 0 108 3z"/>
            <path d="M8 1v4l3-2-3-2z"/>
          </svg>
          <span class="relink-badge">{{ unlinkedCount }}</span>
        </button>
        <button class="panel-btn" @click="onAddFiles" title="Add Video Files">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z"/>
          </svg>
        </button>
        <button class="panel-btn" @click="onCreateFolder" title="New Folder">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M14.5 3H7.71l-.85-1.35A.5.5 0 006.5 1.5h-5A1.5 1.5 0 000 3v10a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0016 13V4.5A1.5 1.5 0 0014.5 3zM9 11H7V9H5V7h2V5h2v2h2v2H9v2z"/>
          </svg>
        </button>
        <button class="panel-btn" @click="onCreateTimeline" title="New Timeline">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M1 2.5A1.5 1.5 0 012.5 1h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 3H13.5A1.5 1.5 0 0115 4.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-10zM2 5v7.5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5V5H2z"/>
          </svg>
        </button>
      </div>
    </div>

    <div
      class="tree-container"
      :class="{ 'drag-over': isDragging }"
      @drop.prevent="onDrop"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
    >
      <FileTreeNode v-if="fileTree.length" :nodes="fileTree" @compress="emit('compress', $event)" />

      <div v-else class="empty-state" @click="onAddFiles">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <path d="M24 8v32M8 24h32" stroke-linecap="round"/>
        </svg>
        <p>Drop video files here<br/>or click to browse</p>
      </div>
    </div>

    <div class="panel-footer">
      <button class="close-project-btn" @click="closeProject">Close Project</button>
    </div>
  </div>
</template>

<style scoped>
.file-tree-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 35px;
  padding: 0 16px 0 20px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--sidebar-fg-dim);
  flex-shrink: 0;
}
.panel-actions {
  display: flex;
  gap: 2px;
}
.panel-btn {
  background: none;
  border: none;
  color: var(--sidebar-fg-dim);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.panel-btn:hover {
  color: var(--sidebar-fg);
  background: var(--list-hover);
}
.tree-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
  transition: background 0.15s;
}
.tree-container.drag-over {
  background: var(--list-hover);
  outline: 2px dashed var(--accent-color);
  outline-offset: -4px;
  border-radius: 4px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--sidebar-fg-dim);
  cursor: pointer;
  gap: 12px;
  text-align: center;
  font-size: 12px;
  opacity: 0.6;
  padding: 20px;
}
.empty-state:hover {
  opacity: 0.9;
}
.empty-state p {
  line-height: 1.5;
}
.panel-footer {
  flex-shrink: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
}
.close-project-btn {
  background: none;
  border: none;
  color: var(--sidebar-fg-dim);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 0;
  opacity: 0.6;
}
.close-project-btn:hover {
  opacity: 1;
  color: var(--sidebar-fg);
}
.relink-btn {
  position: relative;
}
.relink-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #e5c07b;
  color: #1e1e2e;
  font-size: 9px;
  font-weight: 700;
  min-width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  border-radius: 7px;
  padding: 0 3px;
}
</style>
