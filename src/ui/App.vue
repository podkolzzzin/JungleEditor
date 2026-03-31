<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { sidebarOpen, hasProject, projectName, loading, initFromStorage, activeFile, activeTimeline, isTimelineNode } from './store'
import ActivityBar from './components/ActivityBar.vue'
import FileTree from './components/FileTree.vue'
import VideoPreview from './components/VideoPreview.vue'
import TimelineEditor from './components/timeline/TimelineEditor.vue'
import StatusBar from './components/StatusBar.vue'
import LandingScreen from './components/LandingScreen.vue'

const activePanel = ref('explorer')

const showTimeline = computed(() => {
  return activeFile.value && isTimelineNode(activeFile.value) && activeTimeline.value
})

function onActivitySelect(id: string) {
  if (activePanel.value === id && sidebarOpen.value) {
    sidebarOpen.value = false
  } else {
    activePanel.value = id
    sidebarOpen.value = true
  }
}

onMounted(() => {
  initFromStorage()
})
</script>

<template>
  <!-- Loading state -->
  <div v-if="loading" class="app-loading">
    <span class="loading-text">Loading...</span>
  </div>

  <!-- Landing screen when no project -->
  <LandingScreen v-else-if="!hasProject" />

  <!-- Main editor layout -->
  <div v-else class="app-shell">
    <div class="titlebar">
      <span class="titlebar-text">{{ projectName }} — Jungle Editor</span>
    </div>

    <div class="main-area">
      <ActivityBar :active="activePanel" @select="onActivitySelect" />

      <div class="sidebar" v-show="sidebarOpen">
        <FileTree v-if="activePanel === 'explorer'" />
      </div>

      <div class="editor-area">
        <TimelineEditor v-if="showTimeline" />
        <VideoPreview v-else />
      </div>
    </div>

    <StatusBar />
  </div>
</template>

<style scoped>
.app-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--editor-bg);
}

.loading-text {
  color: var(--sidebar-fg-dim);
  font-size: 14px;
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.titlebar {
  height: 30px;
  background: var(--titlebar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--titlebar-fg);
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
}

.titlebar-text {
  opacity: 0.7;
}

.main-area {
  display: flex;
  flex: 1;
  min-height: 0;
}

.sidebar {
  width: 260px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  min-width: 0;
  background: var(--editor-bg);
}
</style>
