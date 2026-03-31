<script setup lang="ts">
import type { TimelineClip } from '../../types'
import { formatTimeFull, parseTimeInput } from './useTimeline'

const props = defineProps<{
  clip: TimelineClip | null
}>()

const emit = defineEmits<{
  dirty: []
}>()

function markDirty() {
  emit('dirty')
}

function addOperation(type: string) {
  if (!props.clip) return
  if (!props.clip.operations) props.clip.operations = []
  const op: any = { type }
  if (type === 'cut') op.at = 0
  if (type === 'remove_segment') { op.from = 0; op.to = 1 }
  if (type === 'speed') op.rate = 1.0
  if (type === 'fade_in' || type === 'fade_out') op.duration = 1.0
  props.clip.operations.push(op)
  markDirty()
}

function removeOperation(index: number) {
  props.clip?.operations?.splice(index, 1)
  markDirty()
}
</script>

<template>
  <div class="inspector-panel">
    <div class="inspector-header">CLIP INSPECTOR</div>
    <div v-if="clip" class="inspector-content">
      <div class="insp-field">
        <label>Source</label>
        <span class="insp-value source-name">{{ clip.sourceName || clip.sourceId }}</span>
      </div>
      <div class="insp-row">
        <div class="insp-field">
          <label>In</label>
          <input
            class="insp-input mono"
            :value="formatTimeFull(clip.in)"
            @change="(e: Event) => { clip!.in = parseTimeInput((e.target as HTMLInputElement).value); markDirty() }"
          />
        </div>
        <div class="insp-field">
          <label>Out</label>
          <input
            class="insp-input mono"
            :value="formatTimeFull(clip.out)"
            @change="(e: Event) => { clip!.out = parseTimeInput((e.target as HTMLInputElement).value); markDirty() }"
          />
        </div>
      </div>
      <div class="insp-field">
        <label>Duration</label>
        <span class="insp-value mono">{{ formatTimeFull(Math.max(0, clip.out - clip.in)) }}</span>
      </div>
      <div class="insp-field">
        <label>Offset</label>
        <input
          class="insp-input mono"
          :value="formatTimeFull(clip.offset ?? 0)"
          @change="(e: Event) => { clip!.offset = parseTimeInput((e.target as HTMLInputElement).value); markDirty() }"
        />
      </div>

      <!-- Operations -->
      <div class="insp-section">
        <div class="insp-section-header">
          <span>Operations</span>
          <div class="insp-op-add">
            <select class="insp-op-select" @change="(e: Event) => {
              const type = (e.target as HTMLSelectElement).value
              if (!type) return
              addOperation(type)
              ;(e.target as HTMLSelectElement).value = ''
            }">
              <option value="">+ Add...</option>
              <option value="cut">Cut</option>
              <option value="remove_segment">Remove Segment</option>
              <option value="speed">Speed</option>
              <option value="fade_in">Fade In</option>
              <option value="fade_out">Fade Out</option>
              <option value="mute">Mute</option>
            </select>
          </div>
        </div>
        <div v-if="clip.operations?.length" class="insp-ops-list">
          <div v-for="(op, oi) in clip.operations" :key="oi" class="insp-op">
            <span class="op-badge" :class="op.type">{{ op.type.replace('_', ' ') }}</span>
            <template v-if="op.type === 'cut'">
              <input class="insp-input mini mono" :value="formatTimeFull(op.at ?? 0)" @change="(e: Event) => { op.at = parseTimeInput((e.target as HTMLInputElement).value); markDirty() }" />
            </template>
            <template v-else-if="op.type === 'remove_segment'">
              <input class="insp-input mini mono" placeholder="from" :value="formatTimeFull(op.from ?? 0)" @change="(e: Event) => { op.from = parseTimeInput((e.target as HTMLInputElement).value); markDirty() }" />
              <input class="insp-input mini mono" placeholder="to" :value="formatTimeFull(op.to ?? 0)" @change="(e: Event) => { op.to = parseTimeInput((e.target as HTMLInputElement).value); markDirty() }" />
            </template>
            <template v-else-if="op.type === 'speed'">
              <input class="insp-input mini mono" type="number" step="0.1" min="0.1" :value="op.rate ?? 1" @input="(e: Event) => { op.rate = Number((e.target as HTMLInputElement).value); markDirty() }" />
            </template>
            <template v-else-if="op.type === 'fade_in' || op.type === 'fade_out'">
              <input class="insp-input mini mono" type="number" step="0.1" min="0" :value="op.duration ?? 1" @input="(e: Event) => { op.duration = Number((e.target as HTMLInputElement).value); markDirty() }" />
            </template>
            <button class="op-remove" @click="removeOperation(oi)">×</button>
          </div>
        </div>
        <div v-else class="insp-ops-empty">No operations</div>
      </div>
    </div>
    <div v-else class="inspector-empty">
      <p>No clip selected</p>
    </div>
  </div>
</template>

<style scoped>
.inspector-panel {
  flex-shrink: 0;
  border-left: none;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: rgba(0,0,0,0.15);
}
.inspector-header {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  color: var(--sidebar-fg-dim);
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}
.inspector-content {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.inspector-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-fg-dim);
  opacity: 0.4;
  font-size: 12px;
}
.insp-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.insp-field label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-fg-dim);
}
.insp-value {
  font-size: 12px;
  color: var(--sidebar-fg);
}
.insp-value.source-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #e5c07b;
}
.insp-row {
  display: flex;
  gap: 10px;
}
.insp-row .insp-field { flex: 1; }
.insp-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border-color);
  color: var(--sidebar-fg);
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-family: var(--sans);
  width: 100%;
}
.insp-input.mono { font-family: var(--mono); }
.insp-input.mini { width: 80px; padding: 2px 6px; font-size: 11px; }
.insp-input:focus { outline: none; border-color: var(--accent-color); }
.mono { font-family: var(--mono); }

/* Inspector operations */
.insp-section { margin-top: 4px; }
.insp-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-fg-dim);
  margin-bottom: 6px;
}
.insp-op-select {
  background: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  color: var(--sidebar-fg);
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 10px;
  font-family: var(--sans);
  cursor: pointer;
}
.insp-op-select:focus { outline: none; border-color: var(--accent-color); }
.insp-op-select option {
  background: var(--sidebar-bg);
  color: var(--sidebar-fg);
}
.insp-op-select option:checked {
  background: var(--list-active);
  color: #fff;
}
.insp-ops-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.insp-op {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.op-badge {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding: 1px 6px;
  border-radius: 2px;
  white-space: nowrap;
}
.op-badge.cut { background: rgba(224,108,117,0.15); color: #e06c75; }
.op-badge.remove_segment { background: rgba(224,108,117,0.15); color: #e06c75; }
.op-badge.speed { background: rgba(229,192,123,0.15); color: #e5c07b; }
.op-badge.fade_in { background: rgba(152,195,121,0.15); color: #98c379; }
.op-badge.fade_out { background: rgba(152,195,121,0.15); color: #98c379; }
.op-badge.mute { background: rgba(198,120,221,0.15); color: #c678dd; }
.op-remove {
  background: none; border: none; color: var(--sidebar-fg-dim);
  cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1;
  margin-left: auto;
}
.op-remove:hover { color: #e06c75; }
.insp-ops-empty {
  font-size: 11px;
  color: var(--sidebar-fg-dim);
  opacity: 0.5;
}
</style>
