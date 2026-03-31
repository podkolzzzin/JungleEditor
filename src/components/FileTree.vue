<script setup lang="ts">
import { ref } from 'vue'
import { fileTree, addFiles, addFolder } from '../store'
import FileTreeNode from './FileTreeNode.vue'

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files.length) {
    addFiles(e.dataTransfer.files)
  }
}

function onDragOver() {
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function triggerFileInput() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) {
    addFiles(input.files)
    input.value = ''
  }
}

function createFolder() {
  const name = prompt('Folder name:')
  if (name?.trim()) {
    addFolder(name.trim())
  }
}
</script>

<template>
  <div class="file-tree-panel">
    <div class="panel-header">
      <span class="panel-title">EXPLORER</span>
      <div class="panel-actions">
        <button class="panel-btn" @click="triggerFileInput" title="Add Files">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z"/>
          </svg>
        </button>
        <button class="panel-btn" @click="createFolder" title="New Folder">
          <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
            <path d="M14.5 3H7.71l-.85-1.35A.5.5 0 006.5 1.5h-5A1.5 1.5 0 000 3v10a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0016 13V4.5A1.5 1.5 0 0014.5 3zM9 11H7V9H5V7h2V5h2v2h2v2H9v2z"/>
          </svg>
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="video/*"
      multiple
      style="display: none"
      @change="onFileSelected"
    />

    <div
      class="tree-container"
      :class="{ 'drag-over': isDragging }"
      @drop.prevent="onDrop"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
    >
      <FileTreeNode v-if="fileTree.length" :nodes="fileTree" />

      <div v-else class="empty-state" @click="triggerFileInput">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <path d="M24 8v32M8 24h32" stroke-linecap="round"/>
        </svg>
        <p>Drop video files here<br/>or click to browse</p>
      </div>
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
</style>
