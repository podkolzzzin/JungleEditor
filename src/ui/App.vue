<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sidebarOpen, hasProject, projectName, loading, initFromStorage, paneLayout } from './store'
import type { FileNode } from '../core/types'
import ActivityBar from './components/ActivityBar.vue'
import FileTree from './components/FileTree.vue'
import StatusBar from './components/StatusBar.vue'
import LandingScreen from './components/LandingScreen.vue'
import ResizeHandle from './components/ResizeHandle.vue'
import EditorLayout from './components/EditorLayout.vue'
import CompressorDialog from './components/CompressorDialog.vue'
import InputDialog from './components/InputDialog.vue'

const activePanel = ref('explorer')
const sidebarWidth = ref(260)

// ── Compressor dialog ──
const compressorNode = ref<FileNode | null>(null)

function onCompress(node: FileNode) {
  compressorNode.value = node
}

function onCompressorClose() {
  compressorNode.value = null
}

function onCompressorDone(_outputName: string) {
  // Future: offer to import the output file
  compressorNode.value = null
}

function onActivitySelect(id: string) {
  if (activePanel.value === id && sidebarOpen.value) {
    sidebarOpen.value = false
  } else {
    activePanel.value = id
    sidebarOpen.value = true
  }
}

function onSidebarResize(delta: number) {
  sidebarWidth.value = Math.max(150, Math.min(600, sidebarWidth.value + delta))
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

      <div class="sidebar" v-show="sidebarOpen" :style="{ width: sidebarWidth + 'px' }">
        <FileTree v-if="activePanel === 'explorer'" @compress="onCompress" />
      </div>

      <ResizeHandle v-show="sidebarOpen" direction="horizontal" @resize="onSidebarResize" />

      <div class="editor-area">
        <EditorLayout :layout="paneLayout" />
      </div>
    </div>

    <StatusBar />

    <!-- Compressor dialog (modal overlay) -->
    <CompressorDialog
      v-if="compressorNode"
      :node="compressorNode"
      @close="onCompressorClose"
      @done="onCompressorDone"
    />

    <!-- VS Code-style input dialog -->
    <InputDialog />
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
  background: var(--sidebar-bg);
  border-right: none;
  flex-shrink: 0;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  min-width: 0;
  background: var(--editor-bg);
}
</style>
