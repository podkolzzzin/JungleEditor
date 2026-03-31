<script setup lang="ts">
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()

function handleDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (files) {
    project.importMediaFiles(Array.from(files))
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}
</script>

<template>
  <div class="media-bin-panel" @drop="handleDrop" @dragover="handleDragOver">
    <div class="panel-header">
      <span class="panel-title">Media Bin</span>
      <button class="import-btn" title="Import media">+</button>
    </div>

    <div class="media-list">
      <div
        v-for="item in project.mediaItems"
        :key="item.id"
        class="media-item"
        draggable="true"
      >
        <div class="media-thumb" :class="item.type">
          {{ item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '🖼️' }}
        </div>
        <span class="media-name">{{ item.name }}</span>
      </div>

      <div v-if="project.mediaItems.length === 0" class="empty-state">
        <p>Drop media files here<br />or click + to import</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-bin-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-md) var(--gap-lg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-title {
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

.import-btn {
  background: var(--color-accent);
  border: none;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-list {
  flex: 1;
  padding: var(--gap-md);
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.media-item {
  display: flex;
  align-items: center;
  gap: var(--gap-md);
  padding: var(--gap-sm) var(--gap-md);
  border-radius: 6px;
  cursor: grab;
  transition: background 0.15s;
}

.media-item:hover {
  background: var(--color-bg-panel);
}

.media-thumb {
  width: 40px;
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  background: var(--color-bg-primary);
}

.media-name {
  font-size: 0.8rem;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  line-height: 1.6;
}
</style>
