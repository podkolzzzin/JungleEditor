<script setup lang="ts">
import { formatTimeFull } from './useTimeline'
import type { Ref } from 'vue'

defineProps<{
  previewUrl: string | null
  previewName: string
  playheadTime: number
}>()

const videoEl = defineModel<HTMLVideoElement | null>('videoEl')

const emit = defineEmits<{
  timeupdate: []
}>()
</script>

<template>
  <div class="preview-panel">
    <div v-if="previewUrl" class="preview-video-wrap">
      <video
        :ref="(el) => { videoEl = el as HTMLVideoElement | null }"
        :src="previewUrl"
        controls
        class="preview-video"
        @timeupdate="emit('timeupdate')"
      />
      <div class="preview-info">
        <span class="preview-name">{{ previewName }}</span>
        <span class="preview-time">{{ formatTimeFull(playheadTime) }}</span>
      </div>
    </div>
    <div v-else class="preview-empty">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
        <path d="M18 14v20l16-10-16-10z" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p>Select a clip to preview</p>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
}
.preview-video-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
}
.preview-video {
  flex: 1;
  max-width: 100%;
  max-height: 240px;
  object-fit: contain;
  outline: none;
  background: #000;
}
.preview-info {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--sidebar-fg-dim);
  background: rgba(0,0,0,0.5);
}
.preview-name { opacity: 0.8; }
.preview-time { font-family: var(--mono); }
.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--sidebar-fg-dim);
  opacity: 0.4;
  font-size: 12px;
}
</style>
