<script setup lang="ts">
import type { FileNode } from '../../core/types'
import { selectFile, toggleFolder, removeNode, activeFile, isTimelineNode } from '../store'

defineProps<{ nodes: FileNode[]; depth?: number }>()

function isVideo(name: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|ogg|flv|wmv|m4v|ts)$/i.test(name)
}

function isTimeline(name: string): boolean {
  return name.endsWith('.timeline')
}

function isDraggableVideo(node: FileNode): boolean {
  return node.type === 'file' && !isTimelineNode(node)
}

function onDragStart(e: DragEvent, node: FileNode) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('application/x-jungle-clip', JSON.stringify({
    sourceId: node.sourceId || node.id,
    sourceName: node.name,
  }))
}
</script>

<template>
  <ul class="tree-list" :style="{ '--depth': depth ?? 0 }">
    <li
      v-for="node in nodes"
      :key="node.id"
      class="tree-node"
    >
      <!-- Folder -->
      <div
        v-if="node.type === 'folder'"
        class="tree-item folder"
        @click="toggleFolder(node)"
      >
        <span class="indent" :style="{ width: (depth ?? 0) * 16 + 'px' }"></span>
        <span class="chevron" :class="{ open: node.expanded }">›</span>
        <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V5a1.5 1.5 0 00-1.5-1.5H7.71L6.85 2.15A.5.5 0 006.5 2h-5z"/>
        </svg>
        <span class="label">{{ node.name }}</span>
        <button class="action-btn remove" @click.stop="removeNode(node.id)" title="Remove">×</button>
      </div>

      <!-- File -->
      <div
        v-else
        class="tree-item file"
        :class="{
          active: activeFile?.id === node.id,
          'needs-permission': !node.url && node.handle,
          'no-handle': !node.url && !node.handle,
        }"
        :draggable="isDraggableVideo(node)"
        @click="selectFile(node)"
        @dragstart="isDraggableVideo(node) && onDragStart($event, node)"
      >
        <span class="indent" :style="{ width: ((depth ?? 0) + 1) * 16 + 'px' }"></span>
        <!-- Timeline icon -->
        <svg v-if="isTimeline(node.name)" class="icon timeline-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 2.5A1.5 1.5 0 012.5 1h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 3H13.5A1.5 1.5 0 0115 4.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-10zM2 5v7.5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5V5H2z"/>
        </svg>
        <svg v-else-if="isVideo(node.name)" class="icon video-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 1a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H1a1 1 0 01-1-1V1zm4 3v8l8-4-8-4z"/>
        </svg>
        <svg v-else class="icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.5 0h6.793a1 1 0 01.707.293l2.707 2.707a1 1 0 01.293.707V14.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 14.5v-13A1.5 1.5 0 013.5 0z"/>
        </svg>
        <!-- Link indicator for files needing re-linking -->
        <svg v-if="!node.url && !node.handle" class="lock-badge" viewBox="0 0 16 16" fill="currentColor" width="10" height="10" title="Click to re-link">
          <path d="M4.715 6.542L3.343 7.914a3 3 0 104.243 4.243l1.828-1.829A3 3 0 008.586 5.5L8 6.086a1.002 1.002 0 00-.154.199 2 2 0 01.861 3.337L6.88 11.45a2 2 0 11-2.83-2.83l.793-.792a4.018 4.018 0 01-.128-1.287z"/>
          <path d="M6.586 4.672A3 3 0 007.414 9.5l.586-.586a1.002 1.002 0 00.154-.199 2 2 0 01-.861-3.337L9.12 3.55a2 2 0 112.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 10-4.243-4.243L6.586 4.672z"/>
        </svg>
        <!-- Lock indicator for files needing re-permission -->
        <svg v-else-if="!node.url && node.handle" class="lock-badge" viewBox="0 0 16 16" fill="currentColor" width="8" height="8">
          <path d="M11 7V5a3 3 0 00-6 0v2H4v7h8V7h-1zm-4-2a1 1 0 012 0v2H7V5z"/>
        </svg>
        <span class="label">{{ node.name }}</span>
        <button class="action-btn remove" @click.stop="removeNode(node.id)" title="Remove">×</button>
      </div>

      <!-- Recurse children -->
      <FileTreeNode
        v-if="node.type === 'folder' && node.expanded && node.children?.length"
        :nodes="node.children"
        :depth="(depth ?? 0) + 1"
      />
    </li>
  </ul>
</template>

<script lang="ts">
export default { name: 'FileTreeNode' }
</script>

<style scoped>
.tree-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tree-node {
  user-select: none;
}
.tree-item {
  display: flex;
  align-items: center;
  height: 22px;
  padding: 0 8px 0 0;
  cursor: pointer;
  font-size: 13px;
  color: var(--sidebar-fg);
  position: relative;
}
.tree-item:hover {
  background: var(--list-hover);
}
.tree-item.active {
  background: var(--list-active);
  color: #fff;
}
.tree-item.needs-permission {
  opacity: 0.6;
}
.tree-item.no-handle {
  opacity: 0.55;
  font-style: italic;
}
.indent {
  flex-shrink: 0;
}
.chevron {
  width: 16px;
  text-align: center;
  font-size: 12px;
  transition: transform 0.15s;
  flex-shrink: 0;
  color: var(--sidebar-fg-dim);
}
.chevron.open {
  transform: rotate(90deg);
}
.icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-right: 6px;
  opacity: 0.7;
}
.icon.video-icon {
  color: #e5c07b;
}
.icon.timeline-icon {
  color: #c678dd;
}
.folder .icon {
  color: #d19a66;
}
.lock-badge {
  position: absolute;
  left: calc(var(--depth, 0) * 16px + 26px);
  bottom: 2px;
  color: #e5c07b;
  opacity: 0.8;
}
.label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.action-btn {
  display: none;
  background: none;
  border: none;
  color: var(--sidebar-fg-dim);
  cursor: pointer;
  font-size: 14px;
  margin-left: auto;
  padding: 0 4px;
  line-height: 1;
}
.action-btn:hover {
  color: #e06c75;
}
.tree-item:hover .action-btn {
  display: block;
}
</style>
