<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()
const fileInputRef = ref<HTMLInputElement | null>(null)

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

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    project.importMediaFiles(Array.from(input.files))
    input.value = '' // reset so same file can be re-selected
  }
}

function handleAddToTimeline(mediaId: string) {
  project.addToTimeline(mediaId)
}
</script>

<template>
  <div class="media-bin-panel" data-testid="media-bin" @drop="handleDrop" @dragover="handleDragOver">
    <div class="panel-header">
      <span class="panel-title">Media Bin</span>
      <button class="import-btn" title="Import media" data-testid="import-media-btn" @click="openFilePicker">+</button>
      <input
        ref="fileInputRef"
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        hidden
        data-testid="file-input"
        @change="handleFileInput"
      />
    </div>

    <div class="media-list" data-testid="media-list">
      <div
        v-for="item in project.mediaItems"
        :key="item.id"
        class="media-item"
        draggable="true"
        :data-testid="`media-item-${item.id}`"
        data-testclass="media-item"
        @dblclick="handleAddToTimeline(item.id)"
      >
        <div class="media-thumb" :class="item.type">
          {{ item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '🖼️' }}
        </div>
        <div class="media-info">
          <span class="media-name" data-testid="media-item-name">{{ item.name }}</span>
          <button
            class="add-timeline-btn"
            title="Add to timeline"
            :data-testid="`add-to-timeline-${item.id}`"
            data-testclass="add-to-timeline-btn"
            @click.stop="handleAddToTimeline(item.id)"
          >+ Timeline</button>
        </div>
      </div>

      <div v-if="project.mediaItems.length === 0" class="empty-state" data-testid="media-bin-empty">
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
  flex-shrink: 0;
}

.media-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.media-name {
  font-size: 0.8rem;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-timeline-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  width: fit-content;
  transition: all 0.15s;
}

.add-timeline-btn:hover {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.empty-state {
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
