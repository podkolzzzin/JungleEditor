<script setup lang="ts">
import type { FileNode } from '../types'
import { selectFile, toggleFolder, removeNode, activeFile } from '../store'

defineProps<{ nodes: FileNode[]; depth?: number }>()

function isVideo(name: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|ogg|flv|wmv|m4v|ts)$/i.test(name)
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
        @click="selectFile(node)"
      >
        <span class="indent" :style="{ width: ((depth ?? 0) + 1) * 16 + 'px' }"></span>
        <svg v-if="isVideo(node.name)" class="icon video-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M0 1a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H1a1 1 0 01-1-1V1zm4 3v8l8-4-8-4z"/>
        </svg>
        <svg v-else class="icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.5 0h6.793a1 1 0 01.707.293l2.707 2.707a1 1 0 01.293.707V14.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 14.5v-13A1.5 1.5 0 013.5 0z"/>
        </svg>
        <!-- Lock indicator for files needing re-permission -->
        <svg v-if="!node.url && node.handle" class="lock-badge" viewBox="0 0 16 16" fill="currentColor" width="8" height="8">
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
  opacity: 0.35;
  text-decoration: line-through;
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
