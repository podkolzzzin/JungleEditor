<script setup lang="ts">
import { computed } from 'vue'
import { findNode, resolveFileUrl } from '../store'

const props = defineProps<{
  fileNodeId: string
}>()

const file = computed(() => findNode(props.fileNodeId))

const state = computed(() => {
  const f = file.value
  if (!f) return 'missing'
  if (f.url) return 'playing'
  if (f.handle) return 'needs-permission'
  return 'no-handle'
})

async function requestAccess() {
  const f = file.value
  if (f) await resolveFileUrl(f)
}
</script>

<template>
  <div class="video-preview">
    <!-- Video player -->
    <div v-if="state === 'playing'" class="video-container">
      <video
        :key="fileNodeId"
        :src="file!.url"
        controls
        autoplay
        class="video-player"
      />
    </div>

    <!-- Permission needed -->
    <div v-else-if="state === 'needs-permission'" class="prompt-container">
      <div class="prompt-card">
        <svg class="prompt-icon" viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
        </svg>
        <p class="prompt-text">This file requires permission to access.</p>
        <button class="grant-btn" @click="requestAccess">Grant Access</button>
        <p class="prompt-hint">Browser will ask for permission to read the file</p>
      </div>
    </div>

    <!-- No handle (reference lost) -->
    <div v-else class="prompt-container">
      <div class="prompt-card">
        <svg class="prompt-icon error" viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <p class="prompt-text">File reference lost.</p>
        <p class="prompt-hint">Please remove this file and re-add it.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--editor-bg);
}

/* Video */
.video-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  min-height: 0;
  background: #000;
}
.video-player {
  max-width: 100%;
  max-height: 100%;
  border-radius: 4px;
  outline: none;
}

/* Permission / error prompts */
.prompt-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.prompt-card {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.prompt-icon {
  color: var(--accent-color);
  opacity: 0.7;
}
.prompt-icon.error {
  color: #e06c75;
}
.prompt-text {
  font-size: 14px;
  color: var(--sidebar-fg);
}
.prompt-hint {
  font-size: 12px;
  color: var(--sidebar-fg-dim);
  opacity: 0.6;
}
.grant-btn {
  background: var(--accent-color);
  color: #fff;
  border: none;
  padding: 8px 24px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.grant-btn:hover {
  background: #0098ff;
}
</style>
