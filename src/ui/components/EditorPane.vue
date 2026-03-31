<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LeafPane, OpenTab } from '../store'
import {
  openTabs,
  focusedPaneId,
  tabDragState,
  splitPane,
  moveTabToPane,
} from '../store'
import EditorTabBar from './EditorTabBar.vue'
import TimelineEditor from './timeline/TimelineEditor.vue'
import VideoPreview from './VideoPreview.vue'

const props = defineProps<{
  pane: LeafPane
}>()

const activeTab = computed<OpenTab | null>(() => {
  if (!props.pane.activeTabId) return null
  return openTabs.get(props.pane.activeTabId) ?? null
})

const isFocused = computed(() => focusedPaneId.value === props.pane.id)

function onPaneClick() {
  focusedPaneId.value = props.pane.id
}

// ── Split drop zones ──
const dropZone = ref<'left' | 'right' | 'top' | 'bottom' | 'center' | null>(null)
const isDragging = computed(() => !!tabDragState.value)

function onDropZoneDragOver(e: DragEvent, zone: 'left' | 'right' | 'top' | 'bottom' | 'center') {
  e.preventDefault()
  e.stopPropagation()
  dropZone.value = zone
}

function onDropZoneDragLeave() {
  dropZone.value = null
}

function onDropZoneDrop(e: DragEvent, zone: 'left' | 'right' | 'top' | 'bottom' | 'center') {
  e.preventDefault()
  e.stopPropagation()
  dropZone.value = null
  if (!tabDragState.value) return
  const { tabId, fromPaneId } = tabDragState.value

  if (zone === 'center') {
    // Move tab into this pane without splitting
    if (fromPaneId !== props.pane.id) {
      moveTabToPane(tabId, fromPaneId, props.pane.id)
    }
  } else {
    // Split this pane with the dragged tab going into a new sibling pane
    const direction = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
    splitPane(props.pane.id, direction, tabId)
  }
  tabDragState.value = null
}
</script>

<template>
  <div
    class="editor-pane"
    :class="{ focused: isFocused }"
    @click.capture="onPaneClick"
  >
    <!-- Tab bar -->
    <EditorTabBar :pane="pane" />

    <!-- Content area -->
    <div class="pane-content">
      <!-- Timeline editor -->
      <TimelineEditor
        v-if="activeTab?.fileType === 'timeline'"
        :pane-id="pane.id"
      />

      <!-- Video preview -->
      <VideoPreview
        v-else-if="activeTab?.fileType === 'video'"
        :file-node-id="activeTab.fileNodeId"
      />

      <!-- Empty / welcome state -->
      <div v-else class="pane-empty">
        <div class="empty-hint">
          <p>Open a file from the explorer</p>
          <p class="hint-dim">or drag a tab here to split</p>
        </div>
      </div>

      <!-- Split drop zones (shown during tab drag) -->
      <template v-if="isDragging">
        <div
          class="drop-zone drop-left"
          :class="{ active: dropZone === 'left' }"
          @dragover.prevent="onDropZoneDragOver($event, 'left')"
          @dragleave="onDropZoneDragLeave"
          @drop="onDropZoneDrop($event, 'left')"
        >
          <span class="drop-label">Split Left</span>
        </div>
        <div
          class="drop-zone drop-right"
          :class="{ active: dropZone === 'right' }"
          @dragover.prevent="onDropZoneDragOver($event, 'right')"
          @dragleave="onDropZoneDragLeave"
          @drop="onDropZoneDrop($event, 'right')"
        >
          <span class="drop-label">Split Right</span>
        </div>
        <div
          class="drop-zone drop-top"
          :class="{ active: dropZone === 'top' }"
          @dragover.prevent="onDropZoneDragOver($event, 'top')"
          @dragleave="onDropZoneDragLeave"
          @drop="onDropZoneDrop($event, 'top')"
        >
          <span class="drop-label">Split Top</span>
        </div>
        <div
          class="drop-zone drop-bottom"
          :class="{ active: dropZone === 'bottom' }"
          @dragover.prevent="onDropZoneDragOver($event, 'bottom')"
          @dragleave="onDropZoneDragLeave"
          @drop="onDropZoneDrop($event, 'bottom')"
        >
          <span class="drop-label">Split Bottom</span>
        </div>
        <div
          class="drop-zone drop-center"
          :class="{ active: dropZone === 'center' }"
          @dragover.prevent="onDropZoneDragOver($event, 'center')"
          @dragleave="onDropZoneDragLeave"
          @drop="onDropZoneDrop($event, 'center')"
        >
          <span class="drop-label">Move Here</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--editor-bg);
  position: relative;
}
.editor-pane.focused {
  outline: none;
}

/* Content area fills the rest */
.pane-content {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

/* Empty state */
.pane-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-fg-dim);
}
.empty-hint {
  text-align: center;
  font-size: 13px;
}
.hint-dim {
  opacity: 0.5;
  margin-top: 6px;
  font-size: 12px;
}

/* ── Split drop zones ── */
.drop-zone {
  position: absolute;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
  transition: background 0.1s, opacity 0.1s;
  opacity: 0;
}
.drop-zone.active {
  opacity: 1;
}
/* All zones start invisible and appear on dragover */
.drop-zone:not(.active) {
  background: transparent !important;
}

.drop-left {
  left: 0; top: 0; bottom: 0;
  width: 25%;
  background: rgba(0, 122, 204, 0.25);
  border-right: 2px solid var(--accent-color);
}
.drop-right {
  right: 0; top: 0; bottom: 0;
  width: 25%;
  background: rgba(0, 122, 204, 0.25);
  border-left: 2px solid var(--accent-color);
}
.drop-top {
  left: 0; right: 0; top: 0;
  height: 25%;
  background: rgba(0, 122, 204, 0.25);
  border-bottom: 2px solid var(--accent-color);
}
.drop-bottom {
  left: 0; right: 0; bottom: 0;
  height: 25%;
  background: rgba(0, 122, 204, 0.25);
  border-top: 2px solid var(--accent-color);
}
.drop-center {
  left: 25%; right: 25%; top: 25%; bottom: 25%;
  background: rgba(0, 122, 204, 0.15);
  border: 2px dashed var(--accent-color);
  border-radius: 4px;
}

/* Always render zones (pointer-events none when not dragging) */
.drop-left, .drop-right, .drop-top, .drop-bottom, .drop-center {
  opacity: 0;
  pointer-events: all;
}
.drop-left:hover, .drop-right:hover, .drop-top:hover, .drop-bottom:hover, .drop-center:hover,
.drop-left.active, .drop-right.active, .drop-top.active, .drop-bottom.active, .drop-center.active {
  opacity: 1;
}

.drop-label {
  font-size: 11px;
  color: var(--accent-color);
  background: var(--editor-bg);
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--accent-color);
  pointer-events: none;
  white-space: nowrap;
}
</style>
