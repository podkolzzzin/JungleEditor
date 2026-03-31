<script setup lang="ts">
import { computed } from 'vue'
import { activeFile, resolveFileUrl, projectName } from '../store'

const state = computed(() => {
  const f = activeFile.value
  if (!f) return 'welcome'
  if (f.url) return 'playing'
  if (f.handle) return 'needs-permission'
  return 'no-handle'
})

async function requestAccess() {
  if (activeFile.value) {
    await resolveFileUrl(activeFile.value)
  }
}
</script>

<template>
  <div class="video-preview">
    <!-- Active file preview -->
    <div v-if="activeFile" class="preview-area">
      <div class="tab-bar">
        <div class="tab active">
          <svg class="tab-icon" viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
            <path d="M0 1a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H1a1 1 0 01-1-1V1zm4 3v8l8-4-8-4z"/>
          </svg>
          <span class="tab-label">{{ activeFile.name }}</span>
          <button class="tab-close" @click="activeFile = null">×</button>
        </div>
      </div>

      <!-- Video player -->
      <div v-if="state === 'playing'" class="video-container">
        <video
          :key="activeFile.id"
          :src="activeFile.url"
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
          <button class="grant-btn" @click="requestAccess">
            Grant Access
          </button>
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

    <!-- Welcome screen -->
    <div v-else class="welcome">
      <div class="welcome-content">
        <h1 class="welcome-title">{{ projectName }}</h1>
        <p class="welcome-subtitle">Jungle Editor</p>
        <div class="welcome-hints">
          <div class="hint-row">
            <kbd>Drop</kbd>
            <span>video files into the explorer</span>
          </div>
          <div class="hint-row">
            <kbd>Click</kbd>
            <span>a file to preview it</span>
          </div>
          <div class="hint-row">
            <kbd>+</kbd>
            <span>to add files or folders</span>
          </div>
        </div>
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

.preview-area {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Tabs */
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 35px;
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--tab-fg);
  border-right: 1px solid var(--border-color);
  cursor: default;
  max-width: 200px;
}
.tab.active {
  background: var(--editor-bg);
  color: var(--tab-active-fg);
  border-bottom: 1px solid var(--accent-color);
  margin-bottom: -1px;
}
.tab-icon {
  flex-shrink: 0;
  color: #e5c07b;
}
.tab-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-close {
  background: none;
  border: none;
  color: var(--tab-fg);
  cursor: pointer;
  font-size: 16px;
  padding: 0 2px;
  line-height: 1;
  border-radius: 3px;
  opacity: 0;
}
.tab:hover .tab-close {
  opacity: 1;
}
.tab-close:hover {
  background: rgba(255, 255, 255, 0.1);
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

/* Welcome */
.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.welcome-content {
  text-align: center;
  color: var(--sidebar-fg-dim);
}
.welcome-title {
  font-size: 28px;
  font-weight: 300;
  color: var(--sidebar-fg);
  margin: 0 0 4px;
  letter-spacing: -0.5px;
}
.welcome-subtitle {
  font-size: 14px;
  margin: 0 0 32px;
  opacity: 0.6;
}
.welcome-hints {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.hint-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
kbd {
  display: inline-block;
  background: var(--list-hover);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 2px 8px;
  font-family: var(--mono, monospace);
  font-size: 12px;
  min-width: 40px;
  text-align: center;
}
</style>
