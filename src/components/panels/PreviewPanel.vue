<script setup lang="ts">
import { ref, onMounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
  // Canvas will be used for WebGPU / Canvas2D preview rendering
})
</script>

<template>
  <div class="preview-panel">
    <canvas ref="canvasRef" class="preview-canvas" />
    <div class="preview-controls">
      <button class="ctrl-btn">⏮</button>
      <button class="ctrl-btn play">▶</button>
      <button class="ctrl-btn">⏭</button>
      <span class="timecode">00:00:00.000</span>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: var(--gap-md);
}

.preview-canvas {
  max-width: 100%;
  max-height: calc(100% - 48px);
  background: #000;
  border-radius: var(--panel-radius);
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: var(--gap-md);
}

.ctrl-btn {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.ctrl-btn:hover {
  background: var(--color-bg-panel);
}

.ctrl-btn.play {
  width: 44px;
  height: 44px;
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.timecode {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-left: var(--gap-md);
}
</style>
