<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { activeRender, activeFile, saveRenderProfile, isRenderNode } from '../../store'
import { RESOLUTION_PRESETS } from '../../../core/types'
import { getCodecsForContainer, AUDIO_BITRATE_PRESETS } from '../../../core/render/codec-map'
import { detectSupportedCodecs } from '../../render/codec-detect'
import type { SupportedCodec } from '../../render/codec-detect'

const supportedCodecs = ref<SupportedCodec[]>([])
const saving = ref(false)

onMounted(async () => {
  try {
    supportedCodecs.value = await detectSupportedCodecs()
  } catch {
    // WebCodecs not available
  }
})

const doc = computed(() => activeRender.value)

// Computed available codecs based on selected container
const availableCodecs = computed(() => {
  if (!doc.value) return []
  const containerCodecs = getCodecsForContainer(doc.value.profile.container)
  return containerCodecs.filter(cc =>
    supportedCodecs.value.some(sc => sc.codecString === cc.codecString && sc.supported),
  )
})

watch(() => doc.value?.profile.container, () => {
  if (!doc.value) return
  // Reset codec if current codec is not compatible with new container
  const compatible = availableCodecs.value.find(c => c.codecString === doc.value!.profile.videoCodec)
  if (!compatible && availableCodecs.value.length > 0) {
    doc.value.profile.videoCodec = availableCodecs.value[0].codecString
  }
})

function setContainer(container: 'mp4' | 'webm') {
  if (!doc.value) return
  doc.value.profile.container = container
}

function setCodec(codecString: string) {
  if (!doc.value) return
  doc.value.profile.videoCodec = codecString
}

function setResolution(label: string) {
  if (!doc.value) return
  if (label === 'custom') return
  const preset = RESOLUTION_PRESETS.find(p => p.label === label)
  if (preset) {
    doc.value.profile.resolution = { width: preset.width, height: preset.height, label: preset.label }
  }
}

function setFps(fps: number) {
  if (!doc.value) return
  doc.value.profile.fps = fps
}

function setQuality(preset: string) {
  if (!doc.value) return
  doc.value.profile.qualityPreset = preset as any
}

function setAudioBitrate(bitrate: number) {
  if (!doc.value) return
  doc.value.profile.audioBitrate = bitrate
}

function toggleAudio() {
  if (!doc.value) return
  doc.value.profile.includeAudio = !doc.value.profile.includeAudio
}

async function onSave() {
  saving.value = true
  try {
    await saveRenderProfile()
  } finally {
    saving.value = false
  }
}

const show = computed(() => doc.value && activeFile.value && isRenderNode(activeFile.value))
</script>

<template>
  <div class="render-editor" v-if="show && doc">
    <div class="render-header">
      <h3 class="render-title">Render Profile: {{ doc.name }}</h3>
      <span class="render-timeline">Timeline: {{ doc.timelineName }}</span>
    </div>

    <div class="render-form">
      <!-- Container format -->
      <div class="insp-field">
        <label>Container</label>
        <div class="btn-group">
          <button
            :class="{ active: doc.profile.container === 'mp4' }"
            @click="setContainer('mp4')"
          >MP4</button>
          <button
            :class="{ active: doc.profile.container === 'webm' }"
            @click="setContainer('webm')"
          >WebM</button>
        </div>
      </div>

      <!-- Video codec -->
      <div class="insp-field">
        <label>Video Codec</label>
        <select :value="doc.profile.videoCodec" @change="setCodec(($event.target as HTMLSelectElement).value)">
          <option
            v-for="codec in availableCodecs"
            :key="codec.codecString"
            :value="codec.codecString"
          >{{ codec.displayName }}</option>
        </select>
      </div>

      <!-- Resolution -->
      <div class="insp-field">
        <label>Resolution</label>
        <select :value="doc.profile.resolution.label" @change="setResolution(($event.target as HTMLSelectElement).value)">
          <option v-for="preset in RESOLUTION_PRESETS" :key="preset.label" :value="preset.label">
            {{ preset.label }} ({{ preset.width }}×{{ preset.height }})
          </option>
        </select>
      </div>

      <!-- Frame rate -->
      <div class="insp-field">
        <label>Frame Rate</label>
        <select :value="doc.profile.fps" @change="setFps(Number(($event.target as HTMLSelectElement).value))">
          <option :value="24">24 fps</option>
          <option :value="25">25 fps</option>
          <option :value="30">30 fps</option>
          <option :value="50">50 fps</option>
          <option :value="60">60 fps</option>
        </select>
      </div>

      <!-- Quality -->
      <div class="insp-field">
        <label>Quality</label>
        <select :value="doc.profile.qualityPreset" @change="setQuality(($event.target as HTMLSelectElement).value)">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="lossless">Lossless</option>
        </select>
      </div>

      <!-- Audio -->
      <div class="insp-field">
        <label>Audio</label>
        <div class="audio-row">
          <label class="checkbox-label">
            <input type="checkbox" :checked="doc.profile.includeAudio" @change="toggleAudio()" />
            Include Audio
          </label>
        </div>
      </div>

      <div class="insp-field" v-if="doc.profile.includeAudio">
        <label>Audio Bitrate</label>
        <select :value="doc.profile.audioBitrate" @change="setAudioBitrate(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="br in AUDIO_BITRATE_PRESETS" :key="br" :value="br">
            {{ br / 1000 }} kbps
          </option>
        </select>
      </div>

      <!-- Actions -->
      <div class="render-actions">
        <button class="save-btn" @click="onSave" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save Profile' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.render-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--editor-bg);
  overflow-y: auto;
  padding: 16px;
}

.render-header {
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.render-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sidebar-fg);
  margin: 0 0 4px;
  font-family: var(--sans);
}

.render-timeline {
  font-size: 12px;
  color: var(--sidebar-fg-dim);
}

.render-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
}

.insp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.insp-field label {
  font-size: 11px;
  color: var(--sidebar-fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.insp-field select,
.insp-field input[type="number"] {
  background: var(--input-bg, #3c3c3c);
  color: var(--sidebar-fg);
  border: 1px solid var(--border-color);
  padding: 4px 6px;
  font-size: 13px;
  font-family: var(--mono);
  border-radius: 2px;
}

.insp-field select:focus,
.insp-field input:focus {
  outline: 1px solid var(--accent-color);
}

.btn-group {
  display: flex;
  gap: 0;
}

.btn-group button {
  flex: 1;
  padding: 5px 12px;
  font-size: 12px;
  background: var(--input-bg, #3c3c3c);
  color: var(--sidebar-fg);
  border: 1px solid var(--border-color);
  cursor: pointer;
}

.btn-group button:first-child {
  border-radius: 3px 0 0 3px;
}

.btn-group button:last-child {
  border-radius: 0 3px 3px 0;
}

.btn-group button.active {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
}

.audio-row {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--sidebar-fg);
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  accent-color: var(--accent-color);
}

.render-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.save-btn {
  padding: 6px 16px;
  font-size: 13px;
  background: var(--accent-color);
  color: #fff;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.save-btn:hover {
  opacity: 0.9;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
