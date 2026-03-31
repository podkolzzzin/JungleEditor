<script setup lang="ts">
</script>

<template>
  <div class="properties-panel">
    <div class="panel-header">
      <span class="panel-title">Properties</span>
    </div>

    <div class="properties-content">
      <p class="empty-hint">Select a clip to view properties</p>
    </div>
  </div>
</template>

<style scoped>
.properties-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  padding: var(--gap-md) var(--gap-lg);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-title {
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-secondary);
}

.properties-content {
  flex: 1;
  padding: var(--gap-lg);
}

.empty-hint {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  text-align: center;
  margin-top: 2rem;
}
</style>
