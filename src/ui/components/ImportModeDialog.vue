<script setup lang="ts">
/**
 * Modal dialog prompting the user to choose how external video files
 * should be imported into the project:
 *   - Copy: duplicate the file into the project folder (safe, uses extra disk space)
 *   - Move: relocate the file into the project folder (saves space, original is deleted)
 *   - Link: reference the file at its original location (dangerous — breaks if moved/deleted)
 *
 * After the user picks a mode the dialog stays open showing copy/move progress,
 * then a summary (including any move-delete failures).
 */

import { ref } from 'vue'
import type { PendingImport, ImportProgress, ImportResult } from '../store'
import { importPickedFiles } from '../store'

const props = defineProps<{
  pending: PendingImport
}>()

const emit = defineEmits<{
  done: []
  cancel: []
}>()

// ── State machine: 'choose' → 'importing' → 'done' ──
const phase = ref<'choose' | 'importing' | 'done'>('choose')
const chosenMode = ref<'copy' | 'move' | 'link'>('copy')
const progress = ref<ImportProgress>({ current: 0, total: 0, fileName: '' })
const result = ref<ImportResult>({ imported: 0, deleteFailures: [] })

async function onSelect(mode: 'copy' | 'move' | 'link') {
  chosenMode.value = mode

  // Link is instant — no progress needed
  if (mode === 'link') {
    phase.value = 'importing'
    progress.value = { current: 1, total: props.pending.handles.length, fileName: '' }
    result.value = await importPickedFiles(props.pending, mode, (p) => {
      progress.value = p
    })
    emit('done')
    return
  }

  phase.value = 'importing'
  progress.value = { current: 0, total: props.pending.handles.length, fileName: 'Preparing…' }

  result.value = await importPickedFiles(props.pending, mode, (p) => {
    progress.value = p
  })

  if (result.value.deleteFailures.length > 0) {
    // Show summary so the user knows which originals to delete
    phase.value = 'done'
  } else {
    emit('done')
  }
}

function onClose() {
  if (phase.value === 'importing') {
    emit('cancel')
  } else {
    emit('done')
  }
}

const modeLabel: Record<string, string> = {
  copy: 'Copying',
  move: 'Moving',
  link: 'Linking',
}
</script>

<template>
  <div class="import-overlay" @click.self="phase === 'choose' ? emit('cancel') : undefined">
    <div class="import-dialog" role="dialog" aria-modal="true" aria-label="Import Files">
      <!-- Header -->
      <div class="dialog-header">
        <span class="dialog-title">
          {{ phase === 'choose' ? 'Import Files' : phase === 'importing' ? modeLabel[chosenMode] + ' files…' : 'Import Complete' }}
        </span>
        <button v-if="phase !== 'importing'" class="close-btn" @click="onClose" title="Close">×</button>
      </div>

      <!-- ═══ Phase: CHOOSE ═══ -->
      <template v-if="phase === 'choose'">
        <!-- File list summary -->
        <div class="file-summary">
          <span class="file-count">{{ pending.fileNames.length }} file{{ pending.fileNames.length !== 1 ? 's' : '' }} selected</span>
          <ul class="file-list">
            <li v-for="name in pending.fileNames.slice(0, 5)" :key="name" class="file-item">{{ name }}</li>
            <li v-if="pending.fileNames.length > 5" class="file-item file-item-more">
              …and {{ pending.fileNames.length - 5 }} more
            </li>
          </ul>
        </div>

        <div class="prompt-text">
          How should these files be added to the project?
        </div>

        <!-- Options -->
        <div class="options">
          <button class="option-btn option-copy" @click="onSelect('copy')" autofocus>
            <div class="option-icon">
              <svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20">
                <path d="M4 4v-2a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1h-2v2a1 1 0 01-1 1H2a1 1 0 01-1-1V6a1 1 0 011-1h2zm1 0h5a1 1 0 011 1v5h2V2H5v2zm-2 2v7h7V6H3z"/>
              </svg>
            </div>
            <div class="option-body">
              <span class="option-label">Copy into project</span>
              <span class="option-desc">Duplicate files into the project folder. Safe & portable — the project stays self-contained.</span>
            </div>
            <span class="option-badge badge-recommended">Recommended</span>
          </button>

          <button class="option-btn option-move" @click="onSelect('move')">
            <div class="option-icon">
              <svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20">
                <path d="M1.5 3h13l.5.5v9l-.5.5h-13l-.5-.5v-9l.5-.5zm0 1v8h13V4h-13zm5.5 2l3 2.5-3 2.5V9H4V7h3V6z"/>
              </svg>
            </div>
            <div class="option-body">
              <span class="option-label">Move into project</span>
              <span class="option-desc">Relocate files into the project folder. Saves disk space — originals are deleted after transfer.</span>
            </div>
          </button>

          <button class="option-btn option-link" @click="onSelect('link')">
            <div class="option-icon icon-dim">
              <svg viewBox="0 0 16 16" fill="currentColor" width="20" height="20">
                <path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-.8 10.45a.75.75 0 01-1.06-1.06l-1.25 1.25a2 2 0 11-2.83-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25z"/>
              </svg>
            </div>
            <div class="option-body">
              <span class="option-label">Link (external reference)</span>
              <span class="option-desc">Keep files at their current location. The project will break if the original files are moved, renamed, or deleted.</span>
            </div>
            <span class="option-badge badge-danger">⚠ Fragile</span>
          </button>
        </div>

        <!-- Footer -->
        <div class="dialog-footer">
          <button class="btn-secondary" @click="emit('cancel')">Cancel</button>
        </div>
      </template>

      <!-- ═══ Phase: IMPORTING (progress) ═══ -->
      <template v-if="phase === 'importing'">
        <div class="progress-section">
          <div class="progress-file-name">{{ progress.fileName }}</div>
          <div class="progress-bar-wrap">
            <div
              class="progress-bar-fill"
              :style="{ width: (progress.total ? (progress.current / progress.total) * 100 : 0).toFixed(1) + '%' }"
            ></div>
          </div>
          <div class="progress-stats">
            <span>{{ progress.current }} / {{ progress.total }} file{{ progress.total !== 1 ? 's' : '' }}</span>
          </div>
        </div>
      </template>

      <!-- ═══ Phase: DONE (move-delete failures) ═══ -->
      <template v-if="phase === 'done'">
        <div class="done-section">
          <div class="done-success">
            ✓ {{ result.imported }} file{{ result.imported !== 1 ? 's' : '' }} imported into the project.
          </div>

          <div v-if="result.deleteFailures.length > 0" class="done-warning">
            <div class="warning-header">
              ⚠ Could not delete {{ result.deleteFailures.length }} original file{{ result.deleteFailures.length !== 1 ? 's' : '' }}
            </div>
            <p class="warning-explain">
              The browser cannot delete files picked from outside the project folder.
              Please remove these originals manually to free disk space:
            </p>
            <ul class="fail-list">
              <li v-for="name in result.deleteFailures" :key="name" class="fail-item">{{ name }}</li>
            </ul>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn-primary" @click="emit('done')" autofocus>OK</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.import-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.import-dialog {
  background: var(--editor-bg, #1e1e1e);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 6px;
  width: 440px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
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

.file-summary {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #3c3c3c);
}

.file-count {
  font-size: 12px;
  color: var(--sidebar-fg-dim, #888);
}

.file-list {
  list-style: none;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-item {
  font-size: 12px;
  color: var(--tab-active-fg, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 8px;
  position: relative;
}

.file-item::before {
  content: '•';
  position: absolute;
  left: 0;
  color: var(--sidebar-fg-dim, #888);
}

.file-item-more {
  color: var(--sidebar-fg-dim, #888);
  font-style: italic;
}

.prompt-text {
  padding: 12px 14px 4px;
  font-size: 12px;
  color: var(--sidebar-fg-dim, #888);
}

.options {
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--titlebar-bg, #2d2d2d);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 4px;
  padding: 10px 12px;
  cursor: pointer;
  color: var(--sidebar-fg, #ccc);
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.option-btn:hover {
  border-color: var(--accent-color, #007acc);
  background: var(--list-hover, rgba(255, 255, 255, 0.05));
}

.option-btn:focus-visible {
  outline: 2px solid var(--accent-color, #007acc);
  outline-offset: -1px;
}

/* Copy button gets a subtle accent border on focus to show it's the recommended default */
.option-copy {
  border-color: rgba(0, 122, 204, 0.35);
}

/* Link button is visually de-emphasized */
.option-link {
  opacity: 0.6;
  border-style: dashed;
}
.option-link:hover {
  opacity: 0.85;
}

.option-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color, #007acc);
}

.icon-dim {
  color: var(--sidebar-fg-dim, #888);
}

.option-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--tab-active-fg, #fff);
}

.option-link .option-label {
  color: var(--sidebar-fg, #ccc);
}

.option-desc {
  font-size: 11px;
  color: var(--sidebar-fg-dim, #888);
  line-height: 1.4;
}

.option-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.badge-recommended {
  background: rgba(0, 122, 204, 0.2);
  color: #4aafff;
}

.badge-danger {
  background: rgba(224, 108, 117, 0.15);
  color: #e06c75;
}

/* ── Progress phase ── */
.progress-section {
  padding: 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-file-name {
  font-size: 12px;
  color: var(--tab-active-fg, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  transition: width 0.25s ease;
}

.progress-stats {
  font-size: 12px;
  color: var(--sidebar-fg-dim, #888);
}

/* ── Done phase ── */
.done-section {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.done-success {
  color: #98c379;
  font-size: 13px;
}

.done-warning {
  background: rgba(229, 192, 123, 0.08);
  border: 1px solid rgba(229, 192, 123, 0.25);
  border-radius: 4px;
  padding: 10px 12px;
}

.warning-header {
  font-size: 13px;
  font-weight: 600;
  color: #e5c07b;
  margin-bottom: 6px;
}

.warning-explain {
  font-size: 11px;
  color: var(--sidebar-fg-dim, #888);
  line-height: 1.5;
  margin-bottom: 8px;
}

.fail-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fail-item {
  font-size: 12px;
  color: var(--tab-active-fg, #fff);
  padding-left: 10px;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fail-item::before {
  content: '•';
  position: absolute;
  left: 0;
  color: #e5c07b;
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

.dialog-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color, #3c3c3c);
}

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
</style>
