<script setup lang="ts">
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()
</script>

<template>
  <div class="toolbar-panel" data-testid="toolbar">
    <div class="toolbar-group">
      <span class="logo">🌴 Jungle Editor</span>
    </div>

    <div class="toolbar-group toolbar-actions">
      <button class="tool-btn" title="Undo" data-testid="undo-btn">↩</button>
      <button class="tool-btn" title="Redo" data-testid="redo-btn">↪</button>
      <span class="separator" />
      <button
        class="tool-btn"
        :class="{ active: project.activeTool === 'cut' }"
        title="Cut tool"
        data-testid="cut-tool-btn"
        @click="project.setActiveTool('cut')"
      >✂</button>
      <button
        class="tool-btn"
        :class="{ active: project.activeTool === 'select' }"
        title="Select tool"
        data-testid="select-tool-btn"
        @click="project.setActiveTool('select')"
      >◻</button>
      <span class="separator" />
      <button
        class="tool-btn"
        title="Split at playhead"
        data-testid="split-btn"
        @click="project.splitAtPlayhead()"
      >⌇</button>
    </div>

    <div class="toolbar-group">
      <button
        class="tool-btn primary"
        title="Export"
        data-testid="export-btn"
        @click="project.openExportDialog()"
      >Export</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--gap-lg);
  height: 100%;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: var(--gap-md);
}

.logo {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--color-accent);
}

.tool-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.15s;
}

.tool-btn:hover {
  background: var(--color-bg-panel);
}

.tool-btn.primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  font-weight: 600;
}

.tool-btn.primary:hover {
  background: var(--color-accent-hover);
}

.tool-btn.active {
  background: var(--color-bg-panel);
  border-color: var(--color-accent);
}

.separator {
  width: 1px;
  height: 24px;
  background: var(--color-border);
}
</style>
