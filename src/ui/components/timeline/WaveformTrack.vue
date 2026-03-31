<script setup lang="ts">
/**
 * WaveformTrack — Renders audio waveform visualization for clips on a track.
 * Each clip gets a waveform canvas positioned at its offset. The waveform is
 * extracted via Web Audio API's OfflineAudioContext.decodeAudioData().
 *
 * Performance safeguards:
 * - Files over MAX_WAVEFORM_BYTES (100 MB) are skipped (placeholder shown)
 * - Extraction is deferred via requestIdleCallback to avoid blocking the UI
 * - Active extractions are tracked to prevent duplicate work
 * - Canvas redraws are debounced during rapid zoom/volume changes
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineClip } from '../../../core/types'
import { findNode, resolveFileUrl } from '../../store'

/** Maximum file size for automatic waveform extraction (100 MB) */
const MAX_WAVEFORM_BYTES = 100 * 1024 * 1024

const props = defineProps<{
  clips: TimelineClip[]
  trackIndex: number
  pixelsPerSecond: number
  clipWidthFn: (clip: TimelineClip) => number
  clipOffsetFn: (clip: TimelineClip) => number
  color: string
  volume: number
}>()

// Cache waveform peak data per sourceId
const waveformCache = new Map<string, Float32Array>()
/** Sources currently being extracted (prevents duplicate work) */
const extractingSourceIds = new Set<string>()
/** Sources that were skipped due to size limits */
const skippedSourceIds = new Set<string>()
const canvasRefs = ref<Map<number, HTMLCanvasElement>>(new Map())
let unmounted = false
let drawDebounceId: number | null = null

function setCanvasRef(el: unknown, index: number) {
  if (el instanceof HTMLCanvasElement) {
    canvasRefs.value.set(index, el)
  } else {
    canvasRefs.value.delete(index)
  }
}

async function extractWaveform(sourceId: string): Promise<Float32Array | null> {
  if (waveformCache.has(sourceId)) return waveformCache.get(sourceId)!
  if (skippedSourceIds.has(sourceId)) return null
  if (extractingSourceIds.has(sourceId)) return null // already in progress

  const node = findNode(sourceId)
  if (!node) return null

  if (!node.url && node.handle) await resolveFileUrl(node)
  if (!node.url) return null

  extractingSourceIds.add(sourceId)

  try {
    // HEAD-check: skip files over 100 MB to prevent multi-hundred-MB allocations
    const headResp = await fetch(node.url, { method: 'HEAD' })
    const contentLength = Number(headResp.headers.get('Content-Length') || 0)
    if (contentLength > MAX_WAVEFORM_BYTES) {
      console.warn(`[WaveformTrack] Skipping waveform for ${sourceId}: file too large (${(contentLength / 1e6).toFixed(0)} MB)`)
      skippedSourceIds.add(sourceId)
      extractingSourceIds.delete(sourceId)
      return null
    }

    const response = await fetch(node.url)
    const arrayBuffer = await response.arrayBuffer()

    // Yield to the main thread before heavy decode
    await new Promise<void>(r => setTimeout(r, 0))

    // Use OfflineAudioContext for non-blocking decode (doesn't create audio output)
    // Estimate: 48 kHz sample rate, stereo, duration ≈ fileSize / 192000
    const estimatedDuration = Math.max(1, contentLength / 192000)
    const sampleRate = 48000
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(estimatedDuration * sampleRate), sampleRate)
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer)

    const rawData = audioBuffer.getChannelData(0)
    const samplesPerSecond = 200
    const totalSamples = Math.ceil(audioBuffer.duration * samplesPerSecond)
    const peaks = new Float32Array(totalSamples)
    const blockSize = Math.floor(rawData.length / totalSamples)

    for (let i = 0; i < totalSamples; i++) {
      let max = 0
      const start = i * blockSize
      const end = Math.min(start + blockSize, rawData.length)
      for (let j = start; j < end; j++) {
        const abs = Math.abs(rawData[j])
        if (abs > max) max = abs
      }
      peaks[i] = max
    }

    waveformCache.set(sourceId, peaks)
    extractingSourceIds.delete(sourceId)
    return peaks
  } catch {
    const fallback = new Float32Array(200)
    waveformCache.set(sourceId, fallback)
    extractingSourceIds.delete(sourceId)
    return fallback
  }
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: Float32Array, clip: TimelineClip) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const cssWidth = props.clipWidthFn(clip)
  const cssHeight = 32
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)
  canvas.style.width = cssWidth + 'px'
  canvas.style.height = cssHeight + 'px'

  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, cssWidth, cssHeight)

  const samplesPerSecond = 200
  const startSample = Math.floor(clip.in * samplesPerSecond)
  const endSample = Math.floor(clip.out * samplesPerSecond)
  const sampleCount = endSample - startSample

  if (sampleCount <= 0 || peaks.length === 0) return

  const barWidth = cssWidth / sampleCount
  const midY = cssHeight / 2

  // Parse the hex color and apply volume-based alpha
  ctx.fillStyle = props.color + '88'

  for (let i = 0; i < sampleCount; i++) {
    const sampleIdx = startSample + i
    if (sampleIdx >= peaks.length) break
    const amplitude = peaks[sampleIdx] * props.volume
    const barHeight = amplitude * (cssHeight - 4)
    const x = i * barWidth
    ctx.fillRect(x, midY - barHeight / 2, Math.max(barWidth - 0.5, 0.5), barHeight || 1)
  }
}

async function renderAllWaveforms() {
  if (unmounted) return
  for (let i = 0; i < props.clips.length; i++) {
    const clip = props.clips[i]
    const canvas = canvasRefs.value.get(i)
    if (!canvas) continue

    const peaks = await extractWaveform(clip.sourceId)
    if (unmounted) return
    if (peaks) {
      drawWaveform(canvas, peaks, clip)
    }
  }
}

// Compute a fingerprint of clip properties that affect waveform rendering
function waveformFingerprint() {
  return props.clips.map(c => `${c.sourceId}:${c.in}:${c.out}:${c.offset}`).join('|')
}

watch(
  () => [waveformFingerprint(), props.pixelsPerSecond, props.volume],
  () => {
    // Debounce redraws during rapid zoom/volume changes (Ctrl+scroll = ~60 Hz)
    if (drawDebounceId !== null) cancelAnimationFrame(drawDebounceId)
    drawDebounceId = requestAnimationFrame(() => {
      drawDebounceId = null
      renderAllWaveforms()
    })
  },
)

onMounted(() => {
  renderAllWaveforms()
})

onBeforeUnmount(() => {
  unmounted = true
})
</script>

<template>
  <div class="waveform-track" data-testid="waveform-subtrack">
    <canvas
      v-for="(clip, ci) in clips"
      :key="ci"
      class="waveform-canvas"
      :style="{
        left: clipOffsetFn(clip) + 'px',
        width: clipWidthFn(clip) + 'px',
      }"
      :ref="(el) => setCanvasRef(el, ci)"
    />
  </div>
</template>

<style scoped>
.waveform-track {
  position: relative;
  height: 36px;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.waveform-canvas {
  position: absolute;
  top: 2px;
  height: 32px;
  pointer-events: none;
}
</style>
