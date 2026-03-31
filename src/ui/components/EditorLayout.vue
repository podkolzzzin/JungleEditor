<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PaneLayout, LeafPane, SplitPane } from '../store'
import { setSplitRatio } from '../store'
import EditorPane from './EditorPane.vue'

const props = defineProps<{
  layout: PaneLayout
}>()

const isLeaf = computed(() => props.layout.type === 'leaf')
const asSplit = computed(() => props.layout as SplitPane)
const asLeaf = computed(() => props.layout as LeafPane)

// ── Resize handle for split panes ──
const splitEl = ref<HTMLElement | null>(null)
const isResizing = ref(false)

function onHandleMouseDown(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true

  function onMouseMove(ev: MouseEvent) {
    if (!splitEl.value) return
    const rect = splitEl.value.getBoundingClientRect()
    let ratio: number
    if (asSplit.value.direction === 'horizontal') {
      ratio = (ev.clientX - rect.left) / rect.width
    } else {
      ratio = (ev.clientY - rect.top) / rect.height
    }
    setSplitRatio(asSplit.value.id, ratio)
  }

  function onMouseUp() {
    isResizing.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <!-- Leaf pane -->
  <EditorPane v-if="isLeaf" :pane="asLeaf" />

  <!-- Split pane -->
  <div
    v-else
    ref="splitEl"
    class="split-container"
    :class="[asSplit.direction, { resizing: isResizing }]"
  >
    <!-- First child -->
    <div
      class="split-child"
      :style="asSplit.direction === 'horizontal'
        ? { width: (asSplit.ratio * 100) + '%' }
        : { height: (asSplit.ratio * 100) + '%' }"
    >
      <EditorLayout :layout="asSplit.first" />
    </div>

    <!-- Resize handle -->
    <div
      class="split-handle"
      :class="asSplit.direction"
      @mousedown="onHandleMouseDown"
    />

    <!-- Second child -->
    <div class="split-child" style="flex: 1">
      <EditorLayout :layout="asSplit.second" />
    </div>
  </div>
</template>

<style scoped>
.split-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.split-container.horizontal {
  flex-direction: row;
}
.split-container.vertical {
  flex-direction: column;
}
.split-container.resizing {
  user-select: none;
}

.split-child {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

/* Resize handle */
.split-handle {
  flex-shrink: 0;
  background: var(--border-color);
  transition: background 0.15s;
  z-index: 10;
  position: relative;
}
.split-handle:hover,
.split-container.resizing .split-handle {
  background: var(--accent-color);
}
.split-handle.horizontal {
  width: 3px;
  cursor: col-resize;
}
.split-handle.vertical {
  height: 3px;
  cursor: row-resize;
}
</style>
