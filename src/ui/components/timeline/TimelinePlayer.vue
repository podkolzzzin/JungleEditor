<script setup lang="ts">
/**
 * TimelinePlayer — High-performance multi-layer video player.
 *
 * Architecture:
 * - Finds ALL active clips at the current playhead position (multi-track compositing).
 * - Renders them as composited layers via the WebGPU-based TimelineCompositor.
 * - Uses requestVideoFrameCallback where available for frame-accurate seek
 *   (falls back to 'seeked' event listeners).
 * - Local playback time (`playTime`) is the authoritative clock during playback,
 *   avoiding the one-frame lag of async Vue prop round-trips.
 * - Double-buffered uniform uploads in the compositor prevent CPU–GPU stalls.
 * - Video elements are cached in a Map and reused across playback.
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { TimelineDocument, TimelineTrack } from '../../../core/types'
import { findNode, resolveFileUrl } from '../../store'
import { TimelineCompositor, findActiveClip, findAllActiveClips } from './compositor'
import type { LayerRenderInfo } from './compositor'
import type { ActiveClipInfo } from '../../../core/timeline/clip-helpers'
import { DEFAULT_COLOR_GRADE } from '../../../core/color'
import { formatTimeFull } from './useTimeline'

const props = defineProps<{
  doc: TimelineDocument | null
  globalPlayhead: number
  isPlaying: boolean
  totalDuration: number
}>()

const emit = defineEmits<{
  'update:globalPlayhead': [time: number]
  'update:isPlaying': [playing: boolean]
}>()

// ── Canvas & Compositor ──

const canvasEl = ref<HTMLCanvasElement | null>(null)
const compositor = new TimelineCompositor()
const gpuMode = ref(false)

// ── Video source management ──

const videoSources = new Map<string, HTMLVideoElement>()
const sourcesLoading = new Set<string>()

/** Set of source IDs that currently have audible playback. */
let audibleSources = new Set<string>()

// ── Volume ──

const volume = ref(0.8)
const muted = ref(false)
let volumeBeforeMute = 0.8

function onVolumeInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value)
  volume.value = val
  if (val > 0 && muted.value) {
    muted.value = false
  } else if (val === 0) {
    muted.value = true
  }
}

function toggleMute() {
  if (muted.value) {
    muted.value = false
    volume.value = volumeBeforeMute > 0 ? volumeBeforeMute : 0.5
  } else {
    volumeBeforeMute = volume.value
    muted.value = true
    volume.value = 0
  }
}

// ── Playback timing ──

let rafId: number | null = null
let lastFrameTime = 0
/** Local authoritative playback time — avoids async prop round-trip lag. */
let playTime = 0

// ── Canvas sizing ──

const canvasWidth = ref(640)
const canvasHeight = ref(360)
const containerEl = ref<HTMLElement | null>(null)

function updateCanvasSize() {
  if (!containerEl.value || !canvasEl.value) return
  const rect = containerEl.value.getBoundingClientRect()
  const w = Math.floor(rect.width)
  const h = Math.floor(Math.min(rect.height, w * 9 / 16))
  const cssW = Math.max(320, w)
  const cssH = Math.max(180, h)

  const dpr = window.devicePixelRatio || 1
  canvasWidth.value = Math.round(cssW * dpr)
  canvasHeight.value = Math.round(cssH * dpr)
  canvasEl.value.width = canvasWidth.value
  canvasEl.value.height = canvasHeight.value
  canvasEl.value.style.width = cssW + 'px'
  canvasEl.value.style.height = cssH + 'px'
}

// ── Video source lifecycle ──

async function ensureVideoSource(sourceId: string): Promise<HTMLVideoElement | null> {
  if (videoSources.has(sourceId)) return videoSources.get(sourceId)!
  if (sourcesLoading.has(sourceId)) return null

  sourcesLoading.add(sourceId)

  const node = findNode(sourceId)
  if (!node) { sourcesLoading.delete(sourceId); return null }

  if (!node.url && node.handle) {
    await resolveFileUrl(node)
  }
  if (!node.url) { sourcesLoading.delete(sourceId); return null }

  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = node.url

  // Re-render on seek completion when paused
  video.addEventListener('seeked', () => {
    if (!props.isPlaying) renderCurrentFrame()
  })

  await new Promise<void>((resolve) => {
    const onReady = () => { cleanup(); resolve() }
    const onError = () => { cleanup(); resolve() }
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('error', onError)
    video.load()
  })

  videoSources.set(sourceId, video)
  sourcesLoading.delete(sourceId)
  return video
}

function getVideoSync(sourceId: string): HTMLVideoElement | null {
  return videoSources.get(sourceId) ?? null
}

async function preloadSources() {
  if (!props.doc) return
  const ids = new Set<string>()
  for (const track of props.doc.tracks) {
    for (const clip of track.clips) {
      ids.add(clip.sourceId)
    }
  }
  await Promise.all([...ids].map(id => ensureVideoSource(id)))
  if (!props.isPlaying) renderCurrentFrame()
}

// ── Multi-layer rendering ──

let pendingRetry: number | null = null

function cancelRetry() {
  if (pendingRetry !== null) {
    clearTimeout(pendingRetry)
    pendingRetry = null
  }
}

function scheduleRetry() {
  if (props.isPlaying) return
  if (pendingRetry !== null) return
  pendingRetry = window.setTimeout(() => {
    pendingRetry = null
    renderCurrentFrame()
  }, 50)
}

/**
 * Render all active layers at the current playhead position.
 * During playback, uses local `playTime` to avoid Vue prop batching lag.
 */
function renderCurrentFrame() {
  if (!props.doc || !canvasEl.value || !compositor.initialized) return

  const time = playTime

  // Find all active clips across all tracks
  const activeClips = findAllActiveClips(props.doc.tracks, time)

  if (activeClips.length === 0) {
    compositor.renderBlack()
    muteAllVideos()
    audibleSources.clear()
    return
  }

  // Build layer render info and manage audio for all active clips
  const layers: LayerRenderInfo[] = []
  const newAudibleSources = new Set<string>()
  let needsRetry = false

  for (const info of activeClips) {
    const video = getVideoSync(info.clip.sourceId)
    if (!video) {
      ensureVideoSource(info.clip.sourceId)
      needsRetry = true
      continue
    }

    // Seek management: avoid redundant seeks
    const seekDelta = Math.abs(video.currentTime - info.sourceTime)
    if (!video.seeking && seekDelta > 0.05) {
      if (!props.isPlaying || seekDelta > 0.15) {
        video.currentTime = info.sourceTime
      }
    }

    // Playback rate sync
    video.playbackRate = info.speed

    // Audio management for this clip
    if (props.isPlaying && !info.muted && !muted.value) {
      video.muted = false
      video.volume = Math.min(1, volume.value * info.trackVolume)
      if (video.paused) {
        video.play().catch(() => {})
      }
      newAudibleSources.add(info.clip.sourceId)
    } else {
      video.muted = true
    }

    // Add layer for rendering
    const colorGrade = info.colorGrade ?? DEFAULT_COLOR_GRADE
    if (video.readyState >= 2) {
      layers.push({ video, opacity: info.opacity, colorGrade })
    } else {
      needsRetry = true
    }
  }

  // Mute videos that are no longer active
  for (const oldId of audibleSources) {
    if (!newAudibleSources.has(oldId)) {
      const v = videoSources.get(oldId)
      if (v) { v.muted = true; v.pause() }
    }
  }
  audibleSources = newAudibleSources

  // Render all layers composited together
  if (layers.length > 0) {
    const ok = compositor.renderLayers(layers)
    if (!ok) needsRetry = true
  } else {
    compositor.renderBlack()
    if (needsRetry) scheduleRetry()
    return
  }

  if (needsRetry) scheduleRetry()
}

function muteAllVideos() {
  for (const v of videoSources.values()) {
    v.muted = true
    v.pause()
  }
}

// ── Playback engine ──

function startPlayback() {
  lastFrameTime = performance.now()
  playTime = props.globalPlayhead
  tickPlayback()
}

function tickPlayback() {
  const now = performance.now()
  const delta = (now - lastFrameTime) / 1000
  lastFrameTime = now

  playTime += delta

  if (playTime >= props.totalDuration) {
    playTime = props.totalDuration
    emit('update:globalPlayhead', playTime)
    emit('update:isPlaying', false)
    renderCurrentFrame()
    return
  }

  emit('update:globalPlayhead', playTime)
  renderCurrentFrame()

  if (props.isPlaying) {
    rafId = requestAnimationFrame(tickPlayback)
  }
}

function stopPlayback() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  for (const video of videoSources.values()) {
    video.pause()
  }
}

// ── Watchers ──

watch(() => props.isPlaying, (playing) => {
  if (playing) {
    startPlayback()
  } else {
    stopPlayback()
  }
})

watch(() => props.globalPlayhead, (newVal) => {
  playTime = newVal
  if (!props.isPlaying) {
    renderCurrentFrame()
  }
})

watch(() => props.doc, () => {
  preloadSources()
  nextTick(() => renderCurrentFrame())
}, { deep: true })

// ── Transport controls ──

function togglePlay() {
  emit('update:isPlaying', !props.isPlaying)
}

function onSeekInput(e: Event) {
  const value = Number((e.target as HTMLInputElement).value)
  emit('update:globalPlayhead', value)
}

function skipBack() {
  emit('update:globalPlayhead', Math.max(0, props.globalPlayhead - 1))
}

function skipForward() {
  emit('update:globalPlayhead', Math.min(props.totalDuration, props.globalPlayhead + 1))
}

function goToStart() {
  emit('update:globalPlayhead', 0)
}

function goToEnd() {
  emit('update:globalPlayhead', props.totalDuration)
}

// ── Lifecycle ──

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  if (canvasEl.value) {
    updateCanvasSize()
    await compositor.init(canvasEl.value)
    gpuMode.value = compositor.useWebGPU
    await preloadSources()
    renderCurrentFrame()
  }

  if (containerEl.value) {
    let lastObservedW = 0
    let lastObservedH = 0
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (Math.abs(width - lastObservedW) < 1 && Math.abs(height - lastObservedH) < 1) return
      lastObservedW = width
      lastObservedH = height
      updateCanvasSize()
      if (!props.isPlaying) renderCurrentFrame()
    })
    resizeObserver.observe(containerEl.value)
  }
  window.addEventListener('resize', updateCanvasSize)
})

onBeforeUnmount(() => {
  stopPlayback()
  cancelRetry()
  compositor.destroy()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', updateCanvasSize)

  for (const video of videoSources.values()) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  videoSources.clear()
  sourcesLoading.clear()
})
</script>

<template>
  <div class="player-panel">
    <!-- Viewport -->
    <div class="player-viewport" ref="containerEl">
      <canvas
        ref="canvasEl"
        class="player-canvas"
      />
      <div v-if="!doc?.tracks.length" class="player-empty">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
          <path d="M18 14v20l16-10-16-10z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Add clips to preview</p>
      </div>
    </div>

    <!-- Scrub bar -->
    <div class="player-scrub">
      <input
        type="range"
        class="scrub-slider"
        min="0"
        :max="totalDuration || 1"
        step="0.001"
        :value="globalPlayhead"
        @input="onSeekInput"
      />
    </div>

    <!-- Transport controls -->
    <div class="player-transport">
      <div class="transport-buttons">
        <button class="transport-btn" @click="goToStart" title="Go to start (Home)">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
            <path d="M2 2h2v12H2V2zm3 6l9 6V2L5 8z"/>
          </svg>
        </button>
        <button class="transport-btn" @click="skipBack" title="Back 1s">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
            <path d="M8 2L0 8l8 6V2zm8 0L8 8l8 6V2z"/>
          </svg>
        </button>
        <button class="transport-btn play-btn" @click="togglePlay" :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'">
          <svg v-if="!isPlaying" viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
            <path d="M4 2l10 6-10 6V2z"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
            <path d="M3 2h4v12H3V2zm6 0h4v12H9V2z"/>
          </svg>
        </button>
        <button class="transport-btn" @click="skipForward" title="Forward 1s">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
            <path d="M0 2l8 6-8 6V2zm8 0l8 6-8 6V2z"/>
          </svg>
        </button>
        <button class="transport-btn" @click="goToEnd" title="Go to end (End)">
          <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
            <path d="M0 2l9 6-9 6V2zm10 0h2v12h-2V2z"/>
          </svg>
        </button>
      </div>

      <div class="transport-time">
        <span class="time-current">{{ formatTimeFull(globalPlayhead) }}</span>
        <span class="time-sep">/</span>
        <span class="time-total">{{ formatTimeFull(totalDuration) }}</span>
      </div>

      <div class="transport-volume">
        <button class="transport-btn volume-btn" @click="toggleMute" :title="muted ? 'Unmute' : 'Mute'">
          <svg v-if="muted || volume === 0" viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
            <path d="M8 2L4 6H1v4h3l4 4V2zm5.5 3.5l-3 3m0-3l3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M8 2L4 6H1v4h3l4 4V2z"/>
          </svg>
          <svg v-else-if="volume < 0.5" viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
            <path d="M8 2L4 6H1v4h3l4 4V2z"/>
            <path d="M10.5 5.5C11.3 6.3 11.8 7.5 11.8 8s-.5 1.7-1.3 2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <svg v-else viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
            <path d="M8 2L4 6H1v4h3l4 4V2z"/>
            <path d="M10.5 4.5C11.6 5.6 12.3 7 12.3 8s-.7 2.4-1.8 3.5M12.5 2.5C14.2 4.2 15 6 15 8s-.8 3.8-2.5 5.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
        <input
          type="range"
          class="volume-slider"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          @input="onVolumeInput"
          title="Volume"
        />
      </div>

      <div class="transport-info">
        <span class="gpu-badge" :class="{ fallback: !gpuMode }" :title="gpuMode ? 'WebGPU accelerated' : 'Canvas2D fallback'">
          {{ gpuMode ? 'GPU' : '2D' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #111;
  overflow: hidden;
}

.player-viewport {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: #000;
}

.player-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.player-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--sidebar-fg-dim);
  opacity: 0.4;
  font-size: 12px;
  pointer-events: none;
}

/* ── Scrub bar ── */
.player-scrub {
  padding: 0 8px;
  height: 18px;
  display: flex;
  align-items: center;
  background: rgba(0,0,0,0.6);
  flex-shrink: 0;
}

.scrub-slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.scrub-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-color, #007acc);
  cursor: pointer;
  border: none;
}

.scrub-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-color, #007acc);
  cursor: pointer;
  border: none;
}

/* ── Transport ── */
.player-transport {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 10px;
  background: rgba(0,0,0,0.5);
  flex-shrink: 0;
  height: 30px;
}

.transport-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
}

.transport-btn {
  background: none;
  border: none;
  color: var(--sidebar-fg-dim, #aaa);
  padding: 3px 5px;
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}

.transport-btn:hover {
  color: #fff;
  background: rgba(255,255,255,0.08);
}

.transport-btn.play-btn {
  background: rgba(255,255,255,0.06);
  padding: 4px 8px;
  margin: 0 2px;
  border-radius: 4px;
}

.transport-btn.play-btn:hover {
  background: var(--accent-color, #007acc);
  color: #fff;
}

.transport-time {
  font-size: 11px;
  font-family: var(--mono, monospace);
  color: var(--sidebar-fg-dim, #aaa);
  display: flex;
  gap: 4px;
  user-select: none;
}

.time-current {
  color: #fff;
  min-width: 85px;
}

.time-sep {
  opacity: 0.3;
}

.time-total {
  opacity: 0.5;
  min-width: 85px;
}

/* ── Volume ── */
.transport-volume {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.volume-btn {
  padding: 3px 4px;
}

.volume-slider {
  width: 70px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255,255,255,0.15);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  vertical-align: middle;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sidebar-fg-dim, #aaa);
  cursor: pointer;
  border: none;
}

.volume-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sidebar-fg-dim, #aaa);
  cursor: pointer;
  border: none;
}

.volume-slider:hover::-webkit-slider-thumb {
  background: #fff;
}

.volume-slider:hover::-moz-range-thumb {
  background: #fff;
}

.transport-info {
  margin-left: 8px;
}

.gpu-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0,180,80,0.2);
  color: #0b4;
  user-select: none;
}

.gpu-badge.fallback {
  background: rgba(200,120,0,0.2);
  color: #c87800;
}
</style>
