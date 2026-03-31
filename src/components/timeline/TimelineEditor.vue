<script setup lang="ts">
import { useTimeline } from './useTimeline'
import TimelinePlayer from './TimelinePlayer.vue'
import ClipInspector from './ClipInspector.vue'
import TimelineTracks from './TimelineTracks.vue'

const {
  activeFile,
  activeTimeline,
  doc,
  dirty,
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
} = useTimeline()

// Keyboard shortcuts
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault()
    togglePlay()
  }
}
</script>

<template>
  <div class="timeline-editor" v-if="doc && activeFile" tabindex="0" @keydown="onKeyDown">
    <!-- Tab bar -->
    <div class="tab-bar">
      <div class="tab active">
        <svg class="tab-icon" viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M1 2.5A1.5 1.5 0 012.5 1h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 3H13.5A1.5 1.5 0 0115 4.5v8a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-10zM2 5v7.5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5V5H2z"/>
        </svg>
        <span class="tab-label">{{ activeFile.name }}</span>
        <span v-if="dirty" class="tab-dirty">&bull;</span>
        <button class="tab-close" @click="activeFile = null; activeTimeline = null">×</button>
      </div>
      <div class="tab-spacer"></div>
      <button class="save-btn" :class="{ active: dirty }" @click="onSave" :disabled="!dirty" title="Save timeline">
        <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
          <path d="M11.5 1h-8A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-9l-2.5-3.5zM5 2h4v3H5V2zm6 12H5V9h6v5z"/>
        </svg>
      </button>
    </div>

    <!-- Main content -->
    <div class="editor-body">
      <!-- Top section: Player + Clip inspector -->
      <div class="top-section">
        <TimelinePlayer
          :doc="doc"
          :global-playhead="globalPlayhead"
          :is-playing="isPlaying"
          :total-duration="totalDuration()"
          @update:global-playhead="globalPlayhead = $event"
          @update:is-playing="isPlaying = $event"
        />

        <ClipInspector
          :clip="inspectedClip"
          @dirty="markDirty"
        />
      </div>

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

/* ── Tab bar ── */
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 35px;
  background: var(--titlebar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--tab-fg);
  border-right: 1px solid var(--border-color);
  cursor: default;
  max-width: 250px;
}
.tab.active {
  background: var(--editor-bg);
  color: var(--tab-active-fg);
  border-bottom: 1px solid var(--accent-color);
  margin-bottom: -1px;
}
.tab-icon { flex-shrink: 0; color: #c678dd; }
.tab-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tab-dirty { color: #e5c07b; font-size: 18px; line-height: 1; }
.tab-close {
  background: none; border: none; color: var(--tab-fg);
  cursor: pointer; font-size: 16px; padding: 0 2px; line-height: 1;
  border-radius: 3px; opacity: 0;
}
.tab:hover .tab-close { opacity: 1; }
.tab-close:hover { background: rgba(255,255,255,0.1); }
.tab-spacer { flex: 1; }
.save-btn {
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--tab-fg);
  padding: 0 12px; cursor: pointer; opacity: 0.4;
}
.save-btn.active { opacity: 1; color: var(--accent-color); }
.save-btn:disabled { cursor: default; }

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
  height: 280px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
}
</style>
