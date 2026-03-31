<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const props = defineProps<{
  direction: 'horizontal' | 'vertical'
}>()

const emit = defineEmits<{
  resize: [delta: number]
}>()

let startPos = 0

function cleanup() {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function onMouseDown(e: MouseEvent) {
  e.preventDefault()
  startPos = props.direction === 'horizontal' ? e.clientX : e.clientY
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = props.direction === 'horizontal' ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
}

function onMouseMove(e: MouseEvent) {
  const current = props.direction === 'horizontal' ? e.clientX : e.clientY
  const delta = current - startPos
  if (delta !== 0) {
    emit('resize', delta)
    startPos = current
  }
}

function onMouseUp() {
  cleanup()
}

onBeforeUnmount(() => {
  cleanup()
})
</script>

<template>
  <div
    class="resize-handle"
    :class="direction"
    @mousedown="onMouseDown"
  />
</template>

<style scoped>
.resize-handle {
  flex-shrink: 0;
  background: transparent;
  position: relative;
  z-index: 10;
}

.resize-handle::after {
  content: '';
  position: absolute;
  background: transparent;
  transition: background 0.15s;
}

.resize-handle:hover::after,
.resize-handle:active::after {
  background: var(--accent-color);
}

/* Horizontal: divider between left/right panels */
.resize-handle.horizontal {
  width: 1px;
  cursor: col-resize;
  background: var(--border-color);
}

.resize-handle.horizontal::after {
  top: 0;
  bottom: 0;
  left: -2px;
  right: -2px;
}

/* Vertical: divider between top/bottom panels */
.resize-handle.vertical {
  height: 1px;
  cursor: row-resize;
  background: var(--border-color);
}

.resize-handle.vertical::after {
  left: 0;
  right: 0;
  top: -2px;
  bottom: -2px;
}
</style>
