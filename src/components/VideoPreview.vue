<script setup lang="ts">
import { activeFile } from '../store'
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

      <div class="video-container">
        <video
          :key="activeFile.id"
          :src="activeFile.url"
          controls
          autoplay
          class="video-player"
        />
      </div>
    </div>

    <!-- Welcome screen -->
    <div v-else class="welcome">
      <div class="welcome-content">
        <h1 class="welcome-title">Jungle Editor</h1>
        <p class="welcome-subtitle">Video Preview</p>
        <div class="welcome-hints">
          <div class="hint-row">
            <kbd>Drop</kbd>
            <span>video files into the explorer</span>
          </div>
          <div class="hint-row">
            <kbd>Click</kbd>
            <span>a file to preview it</span>
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
