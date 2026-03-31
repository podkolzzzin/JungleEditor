<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FileNode } from '../../core/types'
import type { CompressSettings } from '../../core/types'
import { useCompressor } from '../composables/useCompressor'

const props = defineProps<{ node: FileNode }>()
const emit = defineEmits<{
  close: []
  done: [outputName: string]
}>()

// ── Compressor state ──
const { status, progress, errorMessage, compress, cancel, checkCodecSupport } = useCompressor()

// ── Settings ──
const codec = ref<CompressSettings['codec']>('avc1.640028')
const videoBitrate = ref(4_000_000)    // bps
const audioBitrate = ref(128_000)      // bps
const resolutionPreset = ref<'original' | '1080p' | '720p' | '480p'>('original')
const codecWarning = ref(false)

// Validate codec support when codec selection changes
watch(codec, async (c) => {
  codecWarning.value = !(await checkCodecSupport(c))
}, { immediate: true })

const videoBitrateKbps = computed({
  get: () => Math.round(videoBitrate.value / 1000),
  set: (v: number) => { videoBitrate.value = v * 1000 },
})

const resolutionDimensions = computed((): { scaleWidth?: number; scaleHeight?: number } => {
  switch (resolutionPreset.value) {
    case '1080p': return { scaleHeight: 1080 }
    case '720p':  return { scaleHeight: 720 }
    case '480p':  return { scaleHeight: 480 }
    default:      return {}
  }
})

const isRunning = computed(() => status.value === 'encoding')
const isDone = computed(() => status.value === 'done')
const isError = computed(() => status.value === 'error')
const isCancelled = computed(() => status.value === 'cancelled')

// ── Actions ──

async function onStart() {
  if (!props.node.handle) {
    alert('File handle is not available — re-link the file first.')
    return
  }

  // Ask user where to save
  let outputHandle: FileSystemFileHandle
  try {
    outputHandle = await (window as any).showSaveFilePicker({
      suggestedName: props.node.name.replace(/\.[^.]+$/, '_compressed.mp4'),
      types: [
        { description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } },
      ],
    })
  } catch {
    // User cancelled save dialog
    return
  }

  const settings: CompressSettings = {
    codec: codec.value,
    container: 'mp4',
    videoBitrate: videoBitrate.value,
    audioBitrate: audioBitrate.value,
    ...resolutionDimensions.value,
  }

  // Get the actual File object from the handle
  const fileHandle = props.node.handle as FileSystemFileHandle
  const file = await fileHandle.getFile()

  try {
    await compress(file, settings, outputHandle)
    emit('done', outputHandle.name)
  } catch {
    // Error is captured in errorMessage reactive ref
  }
}

function onCancel() {
  cancel()
}

function onClose() {
  if (isRunning.value) {
    cancel()
  }
  emit('close')
}

const etaLabel = computed(() => {
  const s = progress.value.etaSeconds
  if (s <= 0) return ''
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
})
</script>

<template>
  <div class="compressor-overlay" @click.self="onClose">
    <div class="compressor-dialog" role="dialog" aria-modal="true" aria-label="Compress Video">
      <!-- Header -->
      <div class="dialog-header">
        <span class="dialog-title">Compress Video</span>
        <button class="close-btn" @click="onClose" title="Close">×</button>
      </div>

      <!-- Source info -->
      <div class="source-info">
        <span class="source-label">Source:</span>
        <span class="source-name">{{ node.name }}</span>
      </div>

      <!-- Settings (shown when idle/cancelled/error) -->
      <div v-if="!isRunning && !isDone" class="settings-section">
        <!-- Codec -->
        <label class="field-label">Codec</label>
        <select class="field-select" v-model="codec" :disabled="isRunning">
          <option value="avc1.640028">H.264 (AVC)</option>
          <option value="vp09.00.10.08">VP9</option>
        </select>
        <p v-if="codecWarning" class="codec-warning">
          ⚠ This codec may not be hardware-accelerated on your device.
        </p>

        <!-- Video bitrate -->
        <label class="field-label">Video Bitrate: {{ videoBitrateKbps }} kbps</label>
        <input
          class="field-range"
          type="range"
          min="500"
          max="20000"
          step="100"
          v-model.number="videoBitrateKbps"
          :disabled="isRunning"
        />
        <div class="range-labels">
          <span>500 kbps</span><span>20 Mbps</span>
        </div>

        <!-- Audio bitrate -->
        <label class="field-label">Audio Bitrate</label>
        <select class="field-select" v-model.number="audioBitrate" :disabled="isRunning">
          <option :value="64_000">64 kbps</option>
          <option :value="128_000">128 kbps</option>
          <option :value="192_000">192 kbps</option>
          <option :value="256_000">256 kbps</option>
          <option :value="320_000">320 kbps</option>
        </select>

        <!-- Resolution -->
        <label class="field-label">Resolution</label>
        <select class="field-select" v-model="resolutionPreset" :disabled="isRunning">
          <option value="original">Original</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
        </select>
      </div>

      <!-- Progress section (shown while encoding) -->
      <div v-if="isRunning" class="progress-section">
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" :style="{ width: progress.percent.toFixed(1) + '%' }"></div>
        </div>
        <div class="progress-stats">
          <span>{{ progress.percent.toFixed(1) }}%</span>
          <span v-if="progress.fps > 0">{{ progress.fps.toFixed(1) }} fps</span>
          <span v-if="etaLabel">ETA {{ etaLabel }}</span>
        </div>
      </div>

      <!-- Done state -->
      <div v-if="isDone" class="status-msg done">
        ✓ Compression complete!
      </div>

      <!-- Error state -->
      <div v-if="isError" class="status-msg error">
        ✗ Error: {{ errorMessage }}
      </div>

      <!-- Cancelled state -->
      <div v-if="isCancelled" class="status-msg cancelled">
        Compression cancelled.
      </div>

      <!-- Footer actions -->
      <div class="dialog-footer">
        <button v-if="!isRunning && !isDone" class="btn-primary" @click="onStart">
          Compress…
        </button>
        <button v-if="isRunning" class="btn-danger" @click="onCancel">
          Cancel
        </button>
        <button class="btn-secondary" @click="onClose">
          {{ isDone ? 'Close' : 'Cancel' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compressor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.compressor-dialog {
  background: var(--editor-bg, #1e1e1e);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 6px;
  width: 380px;
  max-width: 95vw;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  color: var(--sidebar-fg, #ccc);
  font-size: 13px;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #3c3c3c);
}

.dialog-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--tab-active-fg, #fff);
}

.close-btn {
  background: none;
  border: none;
  color: var(--sidebar-fg-dim, #888);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}
.close-btn:hover { color: #e06c75; }

.source-info {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-color, #3c3c3c);
  font-size: 12px;
}
.source-label { color: var(--sidebar-fg-dim, #888); }
.source-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tab-active-fg, #fff);
}

.settings-section {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  color: var(--sidebar-fg-dim, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.field-select {
  background: var(--titlebar-bg, #2d2d2d);
  border: 1px solid var(--border-color, #3c3c3c);
  color: var(--sidebar-fg, #ccc);
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 12px;
  width: 100%;
}
.field-select:disabled { opacity: 0.5; }

.field-range {
  width: 100%;
  accent-color: var(--accent-color, #007acc);
}
.field-range:disabled { opacity: 0.5; }

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--sidebar-fg-dim, #888);
}

.codec-warning {
  font-size: 11px;
  color: #e5c07b;
  margin: 0;
}

.progress-section {
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-bar-wrap {
  background: var(--titlebar-bg, #2d2d2d);
  border-radius: 3px;
  height: 6px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--accent-color, #007acc);
  transition: width 0.3s;
}

.progress-stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--sidebar-fg-dim, #888);
}

.status-msg {
  padding: 10px 14px;
  font-size: 13px;
}
.status-msg.done    { color: #98c379; }
.status-msg.error   { color: #e06c75; word-break: break-all; }
.status-msg.cancelled { color: var(--sidebar-fg-dim, #888); }

.dialog-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color, #3c3c3c);
}

.btn-primary {
  background: var(--accent-color, #007acc);
  color: #fff;
  border: none;
  border-radius: 3px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.btn-primary:hover { filter: brightness(1.15); }

.btn-secondary {
  background: var(--titlebar-bg, #2d2d2d);
  color: var(--sidebar-fg, #ccc);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 3px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.btn-secondary:hover { background: var(--list-hover, #2a2d2e); }

.btn-danger {
  background: #c0392b;
  color: #fff;
  border: none;
  border-radius: 3px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.btn-danger:hover { filter: brightness(1.15); }
</style>
