<script setup lang="ts">
import { createProject, openProject } from '../store'
</script>

<template>
  <div class="landing">
    <div class="landing-card">
      <div class="logo-area">
        <svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="4" y="4" width="40" height="40" rx="8" stroke-opacity="0.3" />
          <path d="M19 16v16l14-8-14-8z" fill="currentColor" fill-opacity="0.6" stroke="none" />
        </svg>
        <h1 class="title">Jungle Editor</h1>
        <p class="subtitle">Video Project Manager</p>
      </div>

      <div class="actions">
        <button class="action-card" @click="createProject">
          <div class="action-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </div>
          <div class="action-text">
            <strong>Create Project</strong>
            <span>Start a new project in an empty folder</span>
          </div>
        </button>

        <button class="action-card" @click="openProject">
          <div class="action-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          </div>
          <div class="action-text">
            <strong>Open Project</strong>
            <span>Open an existing project folder</span>
          </div>
        </button>
      </div>

      <p class="footer-hint">
        A project is a folder with a <code>.sources</code> directory where file references are stored.
      </p>
    </div>
  </div>
</template>

<style scoped>
.landing {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--editor-bg);
}

.landing-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 40px;
  max-width: 480px;
  width: 100%;
  padding: 20px;
}

.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--sidebar-fg-dim);
}

.title {
  font-size: 32px;
  font-weight: 300;
  color: var(--sidebar-fg);
  margin: 8px 0 0;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 14px;
  opacity: 0.5;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.action-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  color: var(--sidebar-fg);
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
  width: 100%;
}

.action-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: var(--accent-color);
}

.action-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--list-hover);
  color: var(--accent-color);
}

.action-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-text strong {
  font-size: 15px;
  font-weight: 500;
  color: var(--sidebar-fg);
}

.action-text span {
  font-size: 12px;
  color: var(--sidebar-fg-dim);
}

.footer-hint {
  font-size: 11px;
  color: var(--sidebar-fg-dim);
  opacity: 0.5;
  text-align: center;
  line-height: 1.6;
}

.footer-hint code {
  font-family: var(--mono);
  background: var(--list-hover);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
