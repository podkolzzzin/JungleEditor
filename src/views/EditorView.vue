<script setup lang="ts">
import ToolbarPanel from '@/components/panels/ToolbarPanel.vue'
import PreviewPanel from '@/components/panels/PreviewPanel.vue'
import TimelinePanel from '@/components/panels/TimelinePanel.vue'
import MediaBinPanel from '@/components/panels/MediaBinPanel.vue'
import PropertiesPanel from '@/components/panels/PropertiesPanel.vue'
import ExportDialog from '@/components/panels/ExportDialog.vue'
</script>

<template>
  <div class="editor-layout" data-testid="editor-layout">
    <ToolbarPanel class="toolbar" />

    <div class="editor-main">
      <MediaBinPanel class="media-bin" />
      <PreviewPanel class="preview" />
      <PropertiesPanel class="properties" />
    </div>

    <TimelinePanel class="timeline" />
    <ExportDialog />
  </div>
</template>

<style scoped>
.editor-layout {
  display: grid;
  grid-template-rows: var(--toolbar-height) 1fr 280px;
  width: 100vw;
  height: 100vh;
}

.editor-main {
  display: grid;
  grid-template-columns: 260px 1fr 280px;
  min-height: 0;
}

.toolbar {
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.media-bin {
  background: var(--color-bg-surface);
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

.preview {
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.properties {
  background: var(--color-bg-surface);
  border-left: 1px solid var(--color-border);
  overflow-y: auto;
}

.timeline {
  background: var(--color-timeline-bg);
  border-top: 1px solid var(--color-border);
}
</style>
