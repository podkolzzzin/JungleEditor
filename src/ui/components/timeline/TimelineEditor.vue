<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useTimeline } from './useTimeline'
import TimelinePlayer from './TimelinePlayer.vue'
import ClipInspector from './ClipInspector.vue'
import TimelineTracks from './TimelineTracks.vue'
import ResizeHandle from '../ResizeHandle.vue'

const props = defineProps<{ paneId: string }>()

const topSectionHeight = ref(280)
const inspectorWidth = ref(280)

function onTopSectionResize(delta: number) {
  topSectionHeight.value = Math.max(120, Math.min(600, topSectionHeight.value + delta))
}

function onInspectorResize(delta: number) {
  inspectorWidth.value = Math.max(180, Math.min(500, inspectorWidth.value - delta))
}

const {
  activeFile,
  doc,
  dirty: _dirty,
  selectedClip,
  globalPlayhead,
  isPlaying,
  dragOverTrack,
  dragOverNewTrack,
  pixelsPerSecond,
  tracksScrollEl,
  clipDrag,
  clipDragTargetTrack,
  edgeDrag,
  trackDrag,
  trackDragOverIndex,
  clipWidth,
  clipOffsetPx,
  totalDuration,
  timelineWidth,
  rulerMarks,
  markDirty,
  addTrack,
  removeTrack,
  setTrackVolume,
  removeClip,
  selectClip,
  onTrackDragOver,
  onTrackDragLeave,
  onTrackDrop,
  onNewTrackDragOver,
  onNewTrackDragLeave,
  onNewTrackDrop,
  zoomIn,
  zoomOut,
  zoomReset,
  onTimelineWheel,
  onClipMouseDown,
  splitAtPlayhead,
  togglePlay,
  seekTo,
  onEdgeMouseDown,
  onTrackReorderStart,
  inspectedClip,
  onSave,
} = useTimeline(toRef(props, 'paneId'))

// Keyboard shortcuts
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault()
    togglePlay()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    onSave()
  }
}
</script>

<template>
  <div class="timeline-editor" v-if="doc && activeFile" tabindex="0" @keydown="onKeyDown">
    <!-- Main content (no tab bar — handled by EditorPane) -->
    <div class="editor-body">
      <!-- Top section: Player + Clip inspector -->
      <div class="top-section" :style="{ height: topSectionHeight + 'px' }">
        <TimelinePlayer
          :doc="doc"
          :global-playhead="globalPlayhead"
          :is-playing="isPlaying"
          :total-duration="totalDuration()"
          @update:global-playhead="globalPlayhead = $event"
          @update:is-playing="isPlaying = $event"
        />

        <ResizeHandle direction="horizontal" @resize="onInspectorResize" />

        <ClipInspector
          :clip="inspectedClip"
          :style="{ width: inspectorWidth + 'px' }"
          @dirty="markDirty"
        />
      </div>

      <ResizeHandle direction="vertical" @resize="onTopSectionResize" />

      <!-- Bottom: Timeline tracks area -->
      <TimelineTracks
        v-model:tracks-scroll-el="tracksScrollEl"
        :doc="doc"
        :selected-clip="selectedClip"
        :clip-drag="clipDrag"
        :clip-drag-target-track="clipDragTargetTrack"
        :edge-drag="edgeDrag"
        :track-drag="trackDrag"
        :track-drag-over-index="trackDragOverIndex"
        :drag-over-track="dragOverTrack"
        :drag-over-new-track="dragOverNewTrack"
        :pixels-per-second="pixelsPerSecond"
        :total-duration="totalDuration()"
        :timeline-width="timelineWidth()"
        :ruler-marks="rulerMarks()"
        :clip-width-fn="clipWidth"
        :clip-offset-fn="clipOffsetPx"
        :global-playhead="globalPlayhead"
        :is-playing="isPlaying"
        @add-track="addTrack"
        @remove-track="removeTrack"
        @split="splitAtPlayhead"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @zoom-reset="zoomReset"
        @track-dragover="onTrackDragOver"
        @track-dragleave="onTrackDragLeave"
        @track-drop="onTrackDrop"
        @new-track-dragover="onNewTrackDragOver"
        @new-track-dragleave="onNewTrackDragLeave"
        @new-track-drop="onNewTrackDrop"
        @clip-select="selectClip"
        @clip-remove="removeClip"
        @clip-mousedown="onClipMouseDown"
        @edge-mousedown="onEdgeMouseDown"
        @track-reorder-start="onTrackReorderStart"
        @set-track-volume="setTrackVolume"
        @wheel="onTimelineWheel"
        @seek="seekTo"
        @toggle-play="togglePlay"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--editor-bg);
  overflow: hidden;
}

/* ── Editor body ── */
.editor-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ── Top section ── */
.top-section {
  display: flex;
  flex-shrink: 0;
  border-bottom: none;
}
</style>
