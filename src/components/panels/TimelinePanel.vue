<script setup lang="ts">
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()
</script>

<template>
  <div class="timeline-panel">
    <div class="timeline-header">
      <span class="timeline-label">Timeline</span>
      <div class="timeline-zoom">
        <button class="zoom-btn">−</button>
        <button class="zoom-btn">+</button>
      </div>
    </div>

    <div class="timeline-tracks">
      <div class="track" v-for="track in project.tracks" :key="track.id">
        <div class="track-header">
          <span class="track-name">{{ track.name }}</span>
        </div>
        <div class="track-clips">
          <!-- Clips will be rendered here -->
        </div>
      </div>

      <div v-if="project.tracks.length === 0" class="track-placeholder">
        Drop media here to start editing
      </div>
    </div>

    <div class="playhead" />
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
