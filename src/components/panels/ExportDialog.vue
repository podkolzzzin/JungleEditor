<script setup lang="ts">
import { useProjectStore } from '@/stores/project'

const project = useProjectStore()

async function handleStartExport() {
  await project.startExport()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="project.exportDialogOpen" class="export-overlay" data-testid="export-dialog">
      <div class="export-modal">
        <div class="export-header">
          <h2>Export Project</h2>
          <button
            class="close-btn"
            data-testid="export-close-btn"
            @click="project.closeExportDialog()"
          >✕</button>
        </div>

        <div class="export-body">
          <div v-if="project.exportStatus === 'idle'" class="export-settings">
            <div class="setting-row">
              <label>Resolution</label>
              <span>{{ project.settings.width }} × {{ project.settings.height }}</span>
            </div>
            <div class="setting-row">
              <label>FPS</label>
              <span>{{ project.settings.fps }}</span>
            </div>
            <div class="setting-row">
              <label>Format</label>
              <span>MP4 (H.264)</span>
            </div>

            <button
              class="start-export-btn"
              data-testid="start-export-btn"
              @click="handleStartExport"
            >
              Start Export
            </button>
          </div>

          <div v-else-if="project.exportStatus === 'exporting'" class="export-progress">
            <p>Exporting...</p>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${project.exportProgress}%` }"
                data-testid="export-progress-bar"
              />
            </div>
            <span class="progress-text" data-testid="export-progress-text">
              {{ project.exportProgress }}%
            </span>
          </div>

          <div v-else-if="project.exportStatus === 'done'" class="export-done">
            <p data-testid="export-done-message">✅ Export complete!</p>
            <button
              class="close-done-btn"
              data-testid="export-done-close-btn"
              @click="project.closeExportDialog()"
            >
              Close
            </button>
          </div>

          <div v-else-if="project.exportStatus === 'error'" class="export-error">
            <p data-testid="export-error-message">❌ Export failed</p>
            <button @click="project.closeExportDialog()">Close</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.export-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.export-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--panel-radius);
  width: 420px;
  max-width: 90vw;
}

.export-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-lg);
  border-bottom: 1px solid var(--color-border);
}

.export-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--color-text-primary);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  font-size: 1.2rem;
  cursor: pointer;
}

.export-body {
  padding: var(--gap-lg);
}

.export-settings {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.setting-row label {
  color: var(--color-text-secondary);
}

.setting-row span {
  color: var(--color-text-primary);
}

.start-export-btn {
  margin-top: var(--gap-lg);
  background: var(--color-accent);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.start-export-btn:hover {
  background: var(--color-accent-hover);
}

.export-progress {
  text-align: center;
}

.export-progress p {
  margin: 0 0 var(--gap-md);
  color: var(--color-text-primary);
}

.progress-bar {
  height: 8px;
  background: var(--color-bg-primary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.2s;
  border-radius: 4px;
}

.progress-text {
  display: block;
  margin-top: var(--gap-sm);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.export-done, .export-error {
  text-align: center;
}

.export-done p, .export-error p {
  font-size: 1.1rem;
  margin: 0 0 var(--gap-lg);
}

.close-done-btn {
  background: var(--color-bg-panel);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  padding: 8px 20px;
  border-radius: 6px;
  cursor: pointer;
}
</style>
