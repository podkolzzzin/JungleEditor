<script setup lang="ts">
/**
 * WaveformTrack — Renders audio waveform visualization for clips on a track.
 * Each clip gets a waveform canvas positioned at its offset. The waveform is
 * extracted via Web Audio API's OfflineAudioContext.decodeAudioData().
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { TimelineClip } from '../../../core/types'
import { findNode, resolveFileUrl } from '../../store'

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
const canvasRefs = ref<Map<number, HTMLCanvasElement>>(new Map())
let unmounted = false

function setCanvasRef(el: unknown, index: number) {
  if (el instanceof HTMLCanvasElement) {
    canvasRefs.value.set(index, el)
  } else {
    canvasRefs.value.delete(index)
  }
}

async function extractWaveform(sourceId: string): Promise<Float32Array | null> {
  if (waveformCache.has(sourceId)) {
    return waveformCache.get(sourceId)!
  }

  const node = findNode(sourceId)
  if (!node) return null

  if (!node.url && node.handle) {
    await resolveFileUrl(node)
  }
  if (!node.url) return null

  try {
    const response = await fetch(node.url)
    const arrayBuffer = await response.arrayBuffer()

    // Use a temporary AudioContext just for decoding — duration-agnostic
    const tempCtx = new AudioContext()
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer)
    await tempCtx.close()

    const rawData = audioBuffer.getChannelData(0)
    // Downsample to ~200 samples per second (enough for visual display)
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
    return peaks
  } catch {
    // If audio decode fails (e.g. no audio track), return empty waveform
    const fallback = new Float32Array(200)
    waveformCache.set(sourceId, fallback)
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
  () => { renderAllWaveforms() },
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
