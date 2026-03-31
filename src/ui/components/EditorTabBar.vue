<script setup lang="ts">
import { ref, computed } from 'vue'
import type { OpenTab, LeafPane } from '../store'
import {
  openTabs,
  activateTab,
  closeTab,
  reorderTabsInPane,
  moveTabToPane,
  tabDragState,
} from '../store'

const props = defineProps<{
  pane: LeafPane
}>()

// Ordered tabs for this pane
const tabs = computed<OpenTab[]>(() =>
  props.pane.tabIds.map((id) => openTabs.get(id)).filter(Boolean) as OpenTab[]
)

// ── Drag-to-reorder within the bar ──
const dragOverIndex = ref<number | null>(null)

function onTabDragStart(e: DragEvent, tabId: string, index: number) {
  tabDragState.value = { tabId, fromPaneId: props.pane.id }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/tab-id', tabId)
    e.dataTransfer.setData('text/from-pane-id', props.pane.id)
    e.dataTransfer.setData('text/from-index', String(index))
  }
}

function onTabDragEnd() {
  dragOverIndex.value = null
  tabDragState.value = null
}

function onTabBarDragOver(e: DragEvent) {
  e.preventDefault()
  if (!tabDragState.value) return
  const el = e.currentTarget as HTMLElement
  const items = el.querySelectorAll<HTMLElement>('.tab-item')
  let insertIdx = props.pane.tabIds.length
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect()
    if (e.clientX < rect.left + rect.width / 2) {
      insertIdx = i
      break
    }
  }
  dragOverIndex.value = insertIdx
}

function onTabBarDragLeave() {
  dragOverIndex.value = null
}

function onTabBarDrop(e: DragEvent) {
  e.preventDefault()
  dragOverIndex.value = null
  if (!tabDragState.value) return
  const { tabId, fromPaneId } = tabDragState.value
  const fromIndexStr = e.dataTransfer?.getData('text/from-index') ?? ''
  const fromIndex = parseInt(fromIndexStr, 10)

  if (fromPaneId === props.pane.id) {
    // Reorder within the same pane
    const toIdx = props.pane.tabIds.indexOf(tabId)
    const insertAt = computeDropIndex(e)
    const adjustedInsert = insertAt > fromIndex ? insertAt - 1 : insertAt
    if (adjustedInsert !== fromIndex) {
      reorderTabsInPane(props.pane.id, fromIndex, adjustedInsert)
    }
  } else {
    // Move from another pane
    const insertAt = computeDropIndex(e)
    moveTabToPane(tabId, fromPaneId, props.pane.id, insertAt)
  }
  tabDragState.value = null
}

function computeDropIndex(e: DragEvent): number {
  const el = e.currentTarget as HTMLElement
  const items = el.querySelectorAll<HTMLElement>('.tab-item')
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect()
    if (e.clientX < rect.left + rect.width / 2) return i
  }
  return props.pane.tabIds.length
}
</script>

<template>
  <div
    class="tab-bar"
    @dragover="onTabBarDragOver"
    @dragleave="onTabBarDragLeave"
    @drop="onTabBarDrop"
  >
    <!-- Drop indicator before first tab -->
    <div v-if="dragOverIndex === 0" class="tab-drop-indicator" />

    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ active: tab.id === pane.activeTabId }"
      draggable="true"
      @click="activateTab(tab.id, pane.id)"
      @dragstart="onTabDragStart($event, tab.id, index)"
      @dragend="onTabDragEnd"
    >
      <!-- File type icon -->
      <svg
        v-if="tab.fileType === 'timeline'"
        class="tab-icon timeline-icon"
        viewBox="0 0 16 16"
        fill="currentColor"
        width="14"
        height="14"
      >
        <path d="M1 2.5A1.5 1.5 0 012.5 1h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 3H13.5A1.5 1.5 0 0115 4.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-10zM2 5v7.5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5V5H2z"/>
      </svg>
      <svg
        v-else
        class="tab-icon video-icon"
        viewBox="0 0 16 16"
        fill="currentColor"
        width="14"
        height="14"
      >
        <path d="M0 1a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H1a1 1 0 01-1-1V1zm4 3v8l8-4-8-4z"/>
      </svg>

      <span class="tab-label">{{ tab.title }}</span>
      <span v-if="tab.dirty" class="tab-dirty">&bull;</span>
      <button class="tab-close" @click.stop="closeTab(tab.id)" title="Close tab">×</button>

      <!-- Drop indicator after this tab -->
      <div v-if="dragOverIndex === index + 1" class="tab-drop-indicator" />
    </div>

    <div class="tab-spacer" />
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 35px;
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  position: relative;
}
.tab-bar::-webkit-scrollbar { display: none; }

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--tab-fg);
  border-right: 1px solid var(--border-color);
  cursor: pointer;
  flex-shrink: 0;
  max-width: 220px;
  user-select: none;
  position: relative;
}
.tab-item:hover {
  background: rgba(255,255,255,0.04);
}
.tab-item.active {
  background: var(--editor-bg);
  color: var(--tab-active-fg);
  border-bottom: 2px solid var(--accent-color);
  margin-bottom: -1px;
}
.tab-item.active .tab-close { opacity: 1; }

.tab-icon { flex-shrink: 0; }
.timeline-icon { color: #c678dd; }
.video-icon { color: #e5c07b; }

.tab-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.tab-dirty {
  color: #e5c07b;
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
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
  flex-shrink: 0;
}
.tab-item:hover .tab-close { opacity: 1; }
.tab-close:hover { background: rgba(255,255,255,0.1); }

.tab-spacer { flex: 1; min-width: 24px; }

/* Vertical drop indicator line */
.tab-drop-indicator {
  position: absolute;
  right: -2px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--accent-color);
  border-radius: 1px;
  pointer-events: none;
  z-index: 10;
}
</style>
