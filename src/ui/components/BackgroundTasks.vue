<script setup lang="ts">
import { computed } from 'vue'
import { backgroundTasks, removeTask, updateTask } from '../store'

const tasks = computed(() => backgroundTasks)

function onPause(taskId: string) {
  updateTask(taskId, { status: 'paused' })
}

function onResume(taskId: string) {
  updateTask(taskId, { status: 'running' })
}

function onCancel(taskId: string) {
  updateTask(taskId, { status: 'failed', error: 'Cancelled' })
}

function onRemove(taskId: string) {
  removeTask(taskId)
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued': return 'Queued'
    case 'running': return 'Running'
    case 'paused': return 'Paused'
    case 'complete': return 'Complete'
    case 'failed': return 'Failed'
    default: return status
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'running': return 'status-running'
    case 'complete': return 'status-complete'
    case 'failed': return 'status-failed'
    case 'paused': return 'status-paused'
    default: return 'status-queued'
  }
}
</script>

<template>
  <div class="bg-tasks-panel">
    <div class="panel-header">
      <span class="panel-title">BACKGROUND TASKS</span>
    </div>

    <div class="tasks-list" v-if="tasks.length > 0">
      <div v-for="task in tasks" :key="task.id" class="task-item">
        <div class="task-header">
          <span class="task-label">{{ task.label }}</span>
          <span class="task-status" :class="statusClass(task.status)">
            {{ statusLabel(task.status) }}
          </span>
        </div>

        <!-- Progress bar -->
        <div class="progress-bar" v-if="task.status === 'running' || task.status === 'paused'">
          <div class="progress-fill" :style="{ width: (task.progress * 100) + '%' }"></div>
        </div>
        <div class="progress-text" v-if="task.status === 'running'">
          {{ Math.round(task.progress * 100) }}%
        </div>

        <!-- Error message -->
        <div class="task-error" v-if="task.status === 'failed' && task.error">
          {{ task.error }}
        </div>

        <!-- Actions -->
        <div class="task-actions">
          <button
            v-if="task.canPause && task.status === 'running'"
            class="task-btn"
            @click="onPause(task.id)"
            title="Pause"
          >⏸</button>
          <button
            v-if="task.canPause && task.status === 'paused'"
            class="task-btn"
            @click="onResume(task.id)"
            title="Resume"
          >▶</button>
          <button
            v-if="task.canCancel && (task.status === 'running' || task.status === 'paused' || task.status === 'queued')"
            class="task-btn cancel"
            @click="onCancel(task.id)"
            title="Cancel"
          >✕</button>
          <button
            v-if="task.status === 'complete' || task.status === 'failed'"
            class="task-btn"
            @click="onRemove(task.id)"
            title="Remove"
          >✕</button>
        </div>
      </div>
    </div>

    <div class="empty-state" v-else>
      <p>No background tasks</p>
    </div>
  </div>
</template>

<style scoped>
.bg-tasks-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  padding: 8px 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-fg-dim);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-title {
  font-weight: 600;
}

.tasks-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.task-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.task-label {
  font-size: 13px;
  color: var(--sidebar-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  margin-left: 8px;
}

.status-running {
  color: #73c991;
  background: rgba(115, 201, 145, 0.15);
}

.status-complete {
  color: #89d185;
  background: rgba(137, 209, 133, 0.15);
}

.status-failed {
  color: #f48771;
  background: rgba(244, 135, 113, 0.15);
}

.status-paused {
  color: #e5c07b;
  background: rgba(229, 192, 123, 0.15);
}

.status-queued {
  color: var(--sidebar-fg-dim);
  background: rgba(255, 255, 255, 0.05);
}

.progress-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin: 4px 0;
}

.progress-fill {
  height: 100%;
  background: var(--accent-color);
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  color: var(--sidebar-fg-dim);
}

.task-error {
  font-size: 11px;
  color: #f48771;
  margin-top: 4px;
}

.task-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.task-btn {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--sidebar-fg-dim);
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  line-height: 1;
}

.task-btn:hover {
  color: var(--sidebar-fg);
  border-color: var(--sidebar-fg-dim);
}

.task-btn.cancel:hover {
  color: #f48771;
  border-color: #f48771;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-fg-dim);
  font-size: 13px;
}
</style>
