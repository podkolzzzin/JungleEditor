<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()

/** Pixels per second for timeline zoom */
const pxPerSecond = 80

const totalDuration = computed(() => {
  let max = 0
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startTime + clip.duration)
    }
  }
  return max
})

function getClipStyle(clip: { startTime: number; duration: number }) {
  return {
    left: `${clip.startTime * pxPerSecond}px`,
    width: `${clip.duration * pxPerSecond}px`,
  }
}

function getMediaName(mediaId: string): string {
  return project.mediaItems.find((m) => m.id === mediaId)?.name ?? 'Unknown'
}

function handleClipClick(clipId: string, e: MouseEvent) {
  if (project.activeTool === 'cut') {
    // Calculate the timeline position from the click
    const clipEl = (e.currentTarget as HTMLElement)
    const rect = clipEl.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clip = project.allClips.find((c) => c.id === clipId)
    if (clip) {
      const clickTime = clip.startTime + (clickX / pxPerSecond)
      project.splitClip(clipId, clickTime)
    }
  } else {
    project.selectClip(clipId)
  }
}

/** Width of the track header sidebar in pixels */
const trackHeaderWidth = 120

function handleTimelineClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickX = e.clientX - rect.left - trackHeaderWidth
  const time = clickX / pxPerSecond
  project.setCurrentTime(Math.max(0, time))
}
</script>

<template>
  <div class="timeline-panel" data-testid="timeline">
    <div class="timeline-header">
      <span class="timeline-label">Timeline</span>
      <div class="timeline-zoom">
        <button class="zoom-btn" data-testid="zoom-out-btn">−</button>
        <button class="zoom-btn" data-testid="zoom-in-btn">+</button>
      </div>
    </div>

    <div class="timeline-tracks" data-testid="timeline-tracks" @click="handleTimelineClick">
      <div
        class="track"
        v-for="track in project.tracks"
        :key="track.id"
        :data-testid="`track-${track.id}`"
        data-testclass="track"
      >
        <div class="track-header">
          <span class="track-name" data-testid="track-name">{{ track.name }}</span>
        </div>
        <div class="track-clips">
          <div
            v-for="clip in track.clips"
            :key="clip.id"
            class="clip"
            :class="{
              selected: clip.id === project.selectedClipId,
              video: track.type === 'video',
              audio: track.type === 'audio',
            }"
            :style="getClipStyle(clip)"
            :data-testid="`clip-${clip.id}`"
            data-testclass="clip"
            @click.stop="handleClipClick(clip.id, $event)"
          >
            <span class="clip-label">{{ getMediaName(clip.mediaId) }}</span>
          </div>
        </div>
      </div>

      <div v-if="project.tracks.length === 0" class="track-placeholder" data-testid="timeline-empty">
        Drop media here to start editing
      </div>
    </div>

    <div
      class="playhead"
      data-testid="playhead"
      :style="{ left: `${120 + project.currentTime * pxPerSecond}px` }"
    />
  </div>
</template>

<style scoped>
.timeline-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-sm) var(--gap-lg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.timeline-label {
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

.timeline-zoom {
  display: flex;
  gap: var(--gap-sm);
}

.zoom-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
}

.timeline-tracks {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
}

.track {
  display: flex;
  height: var(--timeline-track-height);
  border-bottom: 1px solid var(--color-border);
}

.track-header {
  width: 120px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 var(--gap-md);
  background: var(--color-bg-surface);
  border-right: 1px solid var(--color-border);
}

.track-name {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.track-clips {
  flex: 1;
  position: relative;
}

.clip {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
  overflow: hidden;
  transition: box-shadow 0.15s;
  min-width: 20px;
}

.clip.video {
  background: var(--color-clip-video);
}

.clip.audio {
  background: var(--color-clip-audio);
}

.clip.selected {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--color-accent);
}

.clip-label {
  font-size: 0.7rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.track-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 120px;
  width: 2px;
  background: var(--color-playhead);
  pointer-events: none;
  z-index: 10;
}
</style>
