<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import {
  inputDialogVisible,
  inputDialogTitle,
  inputDialogPlaceholder,
  inputDialogValue,
  confirmInputDialog,
  cancelInputDialog,
} from '../composables/useInputDialog'

const inputEl = ref<HTMLInputElement | null>(null)

watch(inputDialogVisible, async (v) => {
  if (v) {
    await nextTick()
    inputEl.value?.focus()
    inputEl.value?.select()
  }
})

function onConfirm() {
  const v = inputDialogValue.value.trim()
  if (v) {
    confirmInputDialog(v)
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancelInputDialog()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="inputDialogVisible" class="input-dialog-overlay" @click.self="cancelInputDialog" @keydown="onKeydown">
      <div class="input-dialog" role="dialog" aria-modal="true" :aria-label="inputDialogTitle">
        <div class="input-dialog-title">{{ inputDialogTitle }}</div>
        <input
          ref="inputEl"
          v-model="inputDialogValue"
          class="input-dialog-field"
          :placeholder="inputDialogPlaceholder"
          @keydown.enter="onConfirm"
          @keydown.escape="cancelInputDialog"
          spellcheck="false"
          autocomplete="off"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.input-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 10000;
  display: flex;
  justify-content: center;
  padding-top: 0;
}

.input-dialog {
  margin-top: 0;
  width: 520px;
  max-width: 90vw;
  background: var(--sidebar-bg, #252526);
  border: 1px solid var(--border-color, #3c3c3c);
  border-top: none;
  border-radius: 0 0 6px 6px;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.input-dialog-title {
  padding: 10px 14px 4px;
  font-size: 13px;
  color: var(--sidebar-fg, #cccccc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.input-dialog-field {
  display: block;
  width: 100%;
  padding: 6px 14px 10px;
  font-size: 14px;
  font-family: var(--sans);
  color: var(--tab-active-fg, #ffffff);
  background: transparent;
  border: none;
  outline: none;
  caret-color: var(--accent-color, #007acc);
}

.input-dialog-field::placeholder {
  color: var(--sidebar-fg-dim, #8c8c8c);
}
</style>
