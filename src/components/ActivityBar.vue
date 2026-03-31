<script setup lang="ts">
import { sidebarOpen } from '../store'

defineProps<{ active: string }>()
defineEmits<{ (e: 'select', id: string): void }>()
</script>

<template>
  <div class="activity-bar">
    <div class="top-icons">
      <!-- Explorer icon -->
      <button
        class="ab-btn"
        :class="{ active: active === 'explorer' && sidebarOpen }"
        @click="$emit('select', 'explorer')"
        title="Explorer"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M17.5 0H8.12L7 1.12v3.38H4.5A1.5 1.5 0 003 6v16.5A1.5 1.5 0 004.5 24h11a1.5 1.5 0 001.5-1.5V20h2.5a1.5 1.5 0 001.5-1.5v-15L17.5 0zM16 22.5H4.5V6H7v12.5A1.5 1.5 0 008.5 20H16v2.5zM19.5 18.5H8.5V1.62L17.38 1l2.12 2.62V18.5z"/>
        </svg>
      </button>
    </div>

    <div class="bottom-icons">
      <!-- Settings gear -->
      <button class="ab-btn" title="Settings">
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.63-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.04 7.04 0 00-1.63.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32a.49.49 0 00.59.22l2.39-.96a7.04 7.04 0 001.63.94l.36 2.54a.48.48 0 00.48.41h3.84a.48.48 0 00.48-.41l.36-2.54a7.04 7.04 0 001.63-.94l2.39.96a.49.49 0 00.59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.activity-bar {
  width: 48px;
  background: var(--activitybar-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
  padding: 4px 0;
}
.top-icons,
.bottom-icons {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.ab-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--activitybar-fg);
  cursor: pointer;
  border-left: 2px solid transparent;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.ab-btn:hover {
  opacity: 1;
}
.ab-btn.active {
  opacity: 1;
  border-left-color: var(--activitybar-active-border);
  color: var(--activitybar-active-fg);
}
</style>
