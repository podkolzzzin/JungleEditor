<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import type { TimelineDocument } from '../../types'
import type { ClipSelection, TrimEdge } from './useTimeline'
import { formatTime, trackColor, DEFAULT_PPS } from './useTimeline'
import ClipBlock from './ClipBlock.vue'

const TRACK_LABEL_WIDTH = 140

const props = defineProps<{
  doc: TimelineDocument
  selectedClip: ClipSelection | null
  clipDrag: { trackIndex: number; clipIndex: number } | null
  clipDragTargetTrack: number | null
  edgeDrag: { trackIndex: number; clipIndex: number } | null
  dragOverTrack: number | null
  dragOverNewTrack: boolean
  pixelsPerSecond: number
  totalDuration: number
  timelineWidth: number
  rulerMarks: { pos: number; label: string }[]
  clipWidthFn: (clip: any) => number
  clipOffsetFn: (clip: any) => number
  globalPlayhead: number
  isPlaying: boolean
}>()

const emit = defineEmits<{
  'add-track': []
  'remove-track': [index: number]
  'split': []
  'zoom-in': []
  'zoom-out': []
  'zoom-reset': []
  'track-dragover': [e: DragEvent, ti: number]
  'track-dragleave': [e: DragEvent, ti: number]
  'track-drop': [e: DragEvent, ti: number]
  'new-track-dragover': [e: DragEvent]
  'new-track-dragleave': []
  'new-track-drop': [e: DragEvent]
  'clip-select': [ti: number, ci: number]
  'clip-remove': [ti: number, ci: number]
  'clip-mousedown': [e: MouseEvent, ti: number, ci: number]
  'edge-mousedown': [e: MouseEvent, ti: number, ci: number, edge: TrimEdge]
  'wheel': [e: WheelEvent]
  'seek': [time: number]
  'toggle-play': []
}>()

const tracksScrollEl = defineModel<HTMLElement | null>('tracksScrollEl')

function zoomPercent() {
  return Math.round(props.pixelsPerSecond / DEFAULT_PPS * 100)
}

/** Playhead position in pixels from left edge of tracks-scroll */
function playheadPx() {
  return TRACK_LABEL_WIDTH + props.globalPlayhead * props.pixelsPerSecond
}

// ── Ruler click to seek ──

function onRulerClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const x = e.clientX - rect.left
  const time = Math.max(0, x / props.pixelsPerSecond)
  emit('seek', time)
}

// ── Playhead drag ──

let playheadDragging = false

function onPlayheadMouseDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  playheadDragging = true
  window.addEventListener('mousemove', onPlayheadMouseMove)
  window.addEventListener('mouseup', onPlayheadMouseUp)
}

function onPlayheadMouseMove(e: MouseEvent) {
  if (!playheadDragging) return
  const scrollEl = tracksScrollEl.value
  if (!scrollEl) return
  const rect = scrollEl.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollEl.scrollLeft - TRACK_LABEL_WIDTH
  const time = Math.max(0, x / props.pixelsPerSecond)
  emit('seek', time)
}

function onPlayheadMouseUp() {
  playheadDragging = false
  window.removeEventListener('mousemove', onPlayheadMouseMove)
  window.removeEventListener('mouseup', onPlayheadMouseUp)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPlayheadMouseMove)
  window.removeEventListener('mouseup', onPlayheadMouseUp)
})
</script>

<template>
  <div class="timeline-area">
    <!-- Toolbar -->
    <div class="timeline-toolbar">
      <span class="timeline-title">TIMELINE</span>
      <span class="timeline-duration">{{ formatTime(totalDuration) }}</span>
      <div class="toolbar-spacer"></div>
      <div class="zoom-controls">
        <button class="tl-tool-btn small" @click="emit('zoom-out')" title="Zoom out (Ctrl+Scroll down)">
          <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M2 7h12v2H2z"/></svg>
        </button>
        <span class="zoom-label" @click="emit('zoom-reset')" title="Reset zoom">{{ zoomPercent() }}%</span>
        <button class="tl-tool-btn small" @click="emit('zoom-in')" title="Zoom in (Ctrl+Scroll up)">
          <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z"/></svg>
        </button>
      </div>
      <button class="tl-tool-btn" @click="emit('add-track')" title="Add track">
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z"/></svg>
        Track
      </button>
      <button
        class="tl-tool-btn"
        @click="emit('split')"
        title="Split clips at playhead position"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M4.5 1a2.5 2.5 0 00-1.77 4.27L5.46 8l-2.73 2.73A2.5 2.5 0 104.5 15a2.5 2.5 0 001.77-4.27L8 9.01l1.73 1.72A2.5 2.5 0 1013.5 11a2.5 2.5 0 00-1.77-.73L9.54 8l2.19-2.27A2.5 2.5 0 1011.5 1a2.5 2.5 0 00-1.77 4.27L8 7l-1.73-1.73A2.5 2.5 0 004.5 1zM3 3.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm7 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm-7 9a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm7 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"/>
        </svg>
        Split
      </button>
    </div>

    <!-- Scrollable track area -->
    <div
      class="tracks-scroll"
      :ref="(el) => { tracksScrollEl = el as HTMLElement | null }"
      @wheel="emit('wheel', $event)"
    >

      <!-- Playhead line -->
      <div class="playhead-line" :style="{ left: playheadPx() + 'px' }">
        <div class="playhead-handle" @mousedown.stop="onPlayheadMouseDown" />
      </div>

      <!-- Ruler -->
      <div class="ruler" :style="{ width: timelineWidth + 'px' }" @mousedown="onRulerClick">
        <div
          v-for="mark in rulerMarks"
          :key="mark.pos"
          class="ruler-mark"
          :style="{ left: mark.pos + 'px' }"
        >
          <span class="ruler-label">{{ mark.label }}</span>
        </div>
      </div>

      <!-- Track lanes -->
      <div class="track-lanes">
        <div
          v-for="(track, ti) in doc.tracks"
          :key="ti"
          class="track-lane"
          :class="{
            'drag-over': dragOverTrack === ti,
            'clip-drag-target': clipDrag !== null && clipDragTargetTrack === ti && clipDrag.trackIndex !== ti
          }"
          @dragover="emit('track-dragover', $event, ti)"
          @dragleave="emit('track-dragleave', $event, ti)"
          @drop="emit('track-drop', $event, ti)"
        >
          <!-- Track label -->
          <div class="track-label" :style="{ borderLeftColor: trackColor(ti) }">
            <input class="track-name-input" v-model="track.name" />
            <button class="track-remove-btn" @click="emit('remove-track', ti)" title="Remove track">×</button>
          </div>

          <!-- Clip blocks -->
          <div class="track-clips-area" :style="{ width: timelineWidth + 'px' }">
            <ClipBlock
              v-for="(clip, ci) in track.clips"
              :key="ci"
              :clip="clip"
              :track-index="ti"
              :clip-index="ci"
              :selected="selectedClip?.trackIndex === ti && selectedClip?.clipIndex === ci"
              :dragging="clipDrag?.trackIndex === ti && clipDrag?.clipIndex === ci"
              :trimming="edgeDrag?.trackIndex === ti && edgeDrag?.clipIndex === ci"
              :width-px="clipWidthFn(clip)"
              :left-px="clipOffsetFn(clip)"
              @select="(eti: number, eci: number) => emit('clip-select', eti, eci)"
              @remove="(eti: number, eci: number) => emit('clip-remove', eti, eci)"
              @mousedown="(e: MouseEvent) => emit('clip-mousedown', e, ti, ci)"
              @edge-mousedown="(e: MouseEvent, _ti: number, _ci: number, edge: TrimEdge) => emit('edge-mousedown', e, ti, ci, edge)"
            />

            <!-- Empty track hint -->
            <div v-if="!track.clips.length" class="track-empty-hint">
              Drop a video here
            </div>
          </div>
        </div>

        <!-- New track drop zone -->
        <div
          class="new-track-zone"
          :class="{ 'drag-over': dragOverNewTrack }"
          @dragover="emit('new-track-dragover', $event)"
          @dragleave="emit('new-track-dragleave')"
          @drop="emit('new-track-drop', $event)"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z"/></svg>
          Drop here to create new track
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Timeline area ── */
.timeline-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(0,0,0,0.1);
}
.timeline-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 32px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.timeline-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  color: var(--sidebar-fg-dim);
}
.timeline-duration {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--sidebar-fg-dim);
  opacity: 0.6;
}
.toolbar-spacer { flex: 1; }
.tl-tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--sidebar-fg-dim);
  padding: 3px 10px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  font-family: var(--sans);
  transition: all 0.15s;
}
.tl-tool-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}
.tl-tool-btn.disabled {
  opacity: 0.35;
  cursor: default;
}
.tl-tool-btn.disabled:hover {
  border-color: var(--border-color);
  color: var(--sidebar-fg-dim);
}
.tl-tool-btn.small {
  padding: 3px 6px;
}

/* Zoom controls */
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.zoom-label {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--sidebar-fg-dim);
  min-width: 36px;
  text-align: center;
  cursor: pointer;
  user-select: none;
}
.zoom-label:hover {
  color: var(--accent-color);
}

/* Scrollable tracks */
.tracks-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  position: relative;
}

/* Ruler */
.ruler {
  position: sticky;
  top: 0;
  height: 24px;
  background: rgba(30,30,30,0.95);
  border-bottom: 1px solid var(--border-color);
  z-index: 2;
  margin-left: 140px;
  cursor: pointer;
}
.ruler-mark {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid rgba(255,255,255,0.1);
}
.ruler-label {
  position: absolute;
  top: 6px;
  left: 4px;
  font-size: 9px;
  font-family: var(--mono);
  color: var(--sidebar-fg-dim);
  white-space: nowrap;
}

/* Track lanes */
.track-lanes {
  display: flex;
  flex-direction: column;
}
.track-lane {
  display: flex;
  min-height: 52px;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
}
.track-lane.drag-over {
  background: rgba(0,122,204,0.08);
}
.track-lane.clip-drag-target {
  background: rgba(0,122,204,0.12);
  box-shadow: inset 0 0 0 1px var(--accent-color);
}
.track-label {
  width: 140px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 4px 12px;
  border-left: 3px solid;
  background: rgba(255,255,255,0.02);
  border-right: 1px solid var(--border-color);
}
.track-name-input {
  background: none;
  border: none;
  color: var(--sidebar-fg);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--sans);
  padding: 2px 4px;
  border-radius: 3px;
  width: 90px;
}
.track-name-input:focus {
  outline: none;
  background: rgba(255,255,255,0.06);
}
.track-remove-btn {
  background: none; border: none; color: var(--sidebar-fg-dim);
  cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1;
  border-radius: 3px; opacity: 0;
}
.track-lane:hover .track-remove-btn { opacity: 1; }
.track-remove-btn:hover { color: #e06c75; background: var(--list-hover); }

/* Clip blocks area */
.track-clips-area {
  position: relative;
  min-height: 44px;
  padding: 4px 0;
}

.track-empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--sidebar-fg-dim);
  opacity: 0.3;
  pointer-events: none;
}

/* New track drop zone */
.new-track-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  margin: 8px 12px;
  font-size: 11px;
  color: var(--sidebar-fg-dim);
  opacity: 0.4;
  transition: all 0.15s;
}
.new-track-zone.drag-over {
  opacity: 1;
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: rgba(0,122,204,0.08);
}

/* ── Playhead ── */
.playhead-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #e06c75;
  z-index: 5;
  pointer-events: none;
  will-change: left;
}
.playhead-handle {
  position: absolute;
  top: 0;
  left: -6px;
  width: 13px;
  height: 14px;
  background: #e06c75;
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  cursor: ew-resize;
  pointer-events: all;
  z-index: 6;
}
.playhead-handle:hover {
  background: #ff8a8a;
}
</style>
