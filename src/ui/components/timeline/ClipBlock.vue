<script setup lang="ts">
import type { TimelineClip } from '../../../core/types'
import { formatTime, trackColor, type TrimEdge } from './useTimeline'

const props = defineProps<{
  clip: TimelineClip
  trackIndex: number
  clipIndex: number
  selected: boolean
  dragging: boolean
  trimming: boolean
  widthPx: number
  leftPx: number
}>()

const emit = defineEmits<{
  select: [trackIndex: number, clipIndex: number]
  remove: [trackIndex: number, clipIndex: number]
  mousedown: [e: MouseEvent, trackIndex: number, clipIndex: number]
  'edge-mousedown': [e: MouseEvent, trackIndex: number, clipIndex: number, edge: TrimEdge]
}>()

function color() {
  return trackColor(props.trackIndex)
}
</script>

<template>
  <div
    class="clip-block"
    :class="{ selected, dragging, trimming }"
    :style="{
      width: widthPx + 'px',
      left: leftPx + 'px',
      backgroundColor: color() + '33',
      borderColor: color(),
    }"
    @mousedown="emit('mousedown', $event, trackIndex, clipIndex)"
    @click.stop="emit('select', trackIndex, clipIndex)"
  >
    <!-- Left trim handle -->
    <div
      class="trim-handle trim-left"
      @mousedown.stop="emit('edge-mousedown', $event, trackIndex, clipIndex, 'left')"
    ></div>
    <!-- Right trim handle -->
    <div
      class="trim-handle trim-right"
      @mousedown.stop="emit('edge-mousedown', $event, trackIndex, clipIndex, 'right')"
    ></div>
    <span class="clip-name">{{ clip.sourceName || 'No source' }}</span>
    <span class="clip-dur">{{ formatTime(clip.out - clip.in) }}</span>
    <div v-if="clip.operations?.length" class="clip-ops-badges">
      <span
        v-for="(op, oi) in clip.operations"
        :key="oi"
        class="clip-op-dot"
        :class="op.type"
        :title="op.type.replace('_', ' ')"
      ></span>
    </div>
    <button class="clip-remove" @click.stop="emit('remove', trackIndex, clipIndex)">×</button>
  </div>
</template>

<style scoped>
.clip-block {
  position: absolute;
  top: 4px;
  height: 44px;
  border-radius: 4px;
  border-left: 3px solid;
  cursor: grab;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2px 8px;
  overflow: hidden;
  transition: box-shadow 0.15s, filter 0.15s;
  user-select: none;
}
.clip-block:hover {
  filter: brightness(1.2);
}
.clip-block.selected {
  box-shadow: 0 0 0 2px var(--accent-color);
}
.clip-block.dragging {
  cursor: grabbing;
  opacity: 0.85;
  box-shadow: 0 0 0 2px var(--accent-color), 0 4px 12px rgba(0,0,0,0.4);
  z-index: 5;
}
.clip-block.trimming {
  z-index: 5;
  box-shadow: 0 0 0 2px #e5c07b;
}

/* Trim handles */
.trim-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 3;
  transition: background 0.1s;
}
.trim-handle:hover,
.clip-block.trimming .trim-handle {
  background: rgba(229,192,123,0.5);
}
.trim-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 16px;
  border-radius: 1px;
  background: rgba(255,255,255,0.3);
}
.trim-handle:hover::after,
.clip-block.trimming .trim-handle::after {
  background: rgba(255,255,255,0.7);
}
.trim-left {
  left: 0;
  border-radius: 4px 0 0 4px;
}
.trim-left::after {
  left: 2px;
}
.trim-right {
  right: 0;
  border-radius: 0 4px 4px 0;
}
.trim-right::after {
  right: 2px;
}

.clip-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--sidebar-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.clip-dur {
  font-size: 9px;
  font-family: var(--mono);
  color: var(--sidebar-fg-dim);
  opacity: 0.7;
}
.clip-ops-badges {
  display: flex;
  gap: 3px;
  margin-top: 1px;
}
.clip-op-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #56b6c2;
}
.clip-op-dot.cut, .clip-op-dot.remove_segment { background: #e06c75; }
.clip-op-dot.speed { background: #e5c07b; }
.clip-op-dot.fade_in, .clip-op-dot.fade_out { background: #98c379; }
.clip-op-dot.mute { background: #c678dd; }

.clip-remove {
  position: absolute;
  top: 2px;
  right: 4px;
  background: none; border: none;
  color: var(--sidebar-fg-dim);
  cursor: pointer; font-size: 13px;
  line-height: 1; opacity: 0;
}
.clip-block:hover .clip-remove { opacity: 1; }
.clip-remove:hover { color: #e06c75; }
</style>
