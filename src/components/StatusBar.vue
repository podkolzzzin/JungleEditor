<script setup lang="ts">
import { projectName, fileCount } from '../store'
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-item">{{ projectName }}</span>
    </div>
    <div class="status-right">
      <span class="status-item">{{ fileCount }} source{{ fileCount === 1 ? '' : 's' }}</span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 22px;
  background: var(--statusbar-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 12px;
  color: var(--statusbar-fg);
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
}
.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-item {
  padding: 0 4px;
  cursor: default;
}
.status-item:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
