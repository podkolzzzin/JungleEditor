# Jungle Editor — Copilot Instructions

## Project Identity

**Jungle Editor** is a full-featured, browser-native video editor. All code runs client-side. There is no backend server for editing operations.

## Tech Stack (always use these)

- **Vue 3** with `<script setup lang="ts">` and Composition API — never use Options API
- **TypeScript 5.8** in strict mode — all code must be fully typed, no `any` unless absolutely unavoidable
- **Vite 6** for builds and dev server
- **Pinia 3** for state management (single `project` store as source of truth)
- **Vue Router 4** for SPA navigation

## Key Browser APIs (know these well)

- **WebGPU** — all video frame compositing, effects, and preview rendering
- **WebCodecs** (`VideoDecoder`, `VideoEncoder`, `AudioDecoder`, `AudioEncoder`) — hardware-accelerated codec access
- **Web Audio API** (`AudioContext`, `GainNode`, `AnalyserNode`) — real-time audio mixing and effects
- **Web Workers** + `SharedArrayBuffer` — off-main-thread processing for CPU-intensive tasks
- **File System Access API** / **Origin Private File System (OPFS)** — persistent file storage
- **Streams API** (ReadableStream, WritableStream, BYOB) — progressive media I/O
- **Canvas API** — fallback rendering when WebGPU is unavailable
- **requestAnimationFrame** / `requestVideoFrameCallback` — frame-accurate playback timing

## Code Style Rules

1. Use `<script setup lang="ts">` for all Vue components
2. Use Composition API (`ref`, `computed`, `watch`, `onMounted`, etc.) — never Options API
3. Prefer `const` over `let`; never use `var`
4. Use `crypto.randomUUID()` for generating IDs
5. Use `import type { ... }` for type-only imports
6. Name files in kebab-case; name components in PascalCase
7. Composables go in `src/composables/` and are named `use*.ts`
8. Engine modules go in `src/engine/` — these are pure TypeScript, no Vue dependency
9. All domain types live in `src/core/types.ts`
10. CSS uses custom properties defined in `src/assets/main.css`

## Architecture Principles

- **Non-destructive editing**: original media is never modified; edits are parametric
- **Engine/UI separation**: `src/engine/` has zero Vue imports; it reads from plain data
- **Single store truth**: the Pinia `project` store is the canonical project state
- **GPU-first rendering**: prefer WebGPU for compositing; Canvas2D only as fallback
- **Off-main-thread**: CPU-heavy work (waveforms, thumbnails, encoding) goes to Web Workers
- **Zero-copy when possible**: pass `VideoFrame` objects directly to GPU textures

## Directory Map

```
src/
├── main.ts              # Entry point
├── App.vue              # Root component
├── router/index.ts      # Routes
├── stores/project.ts    # Pinia store (single source of truth)
├── views/               # Route-level views
├── components/panels/   # Major UI panels (Toolbar, Preview, Timeline, MediaBin, Properties)
├── core/types.ts        # All domain TypeScript interfaces
├── engine/              # Performance-critical subsystems (no Vue)
│   ├── render.ts        # WebGPU compositor
│   ├── playback.ts      # rAF-based playback loop
│   ├── decoder.ts       # WebCodecs decode service
│   ├── audio.ts         # Web Audio mixing
│   └── export.ts        # Encode + mux export pipeline
├── composables/         # Shared Vue composables
├── workers/             # Web Worker scripts
└── assets/main.css      # Global styles + CSS custom properties
```

## Data Model (key types in `src/core/types.ts`)

- `Project` — top-level: settings, tracks, media items, playhead
- `Track` — video or audio track containing clips
- `Clip` — a segment of a media item placed on the timeline
- `MediaItem` — imported media file metadata + object URL
- `Effect` — parametric effect attached to a clip
- `Transition` — transition between adjacent clips

## When Writing Engine Code

- Engine modules (`src/engine/`) must NOT import from Vue or Pinia
- They receive plain data (typed interfaces from `core/types.ts`)
- They return results or call callbacks — no reactive state internally
- Use `performance.now()` for timing, not `Date.now()`
- Always check API availability before using (e.g., `if (!navigator.gpu)`)
- Provide graceful fallbacks where possible

## When Writing UI Code

- Keep components focused — one panel per file
- Use composables to share logic between components
- Access state only via `useProjectStore()`
- Emit events up, pass props down — standard Vue patterns
- Use CSS custom properties from `main.css` for theming
- Prefer `<template>` logic over render functions

## Performance Budget

- Main thread frame time: < 16ms
- Preview: 60fps for 1080p with 3 video layers
- Seek latency: < 100ms
- Keep engine code allocation-free in hot paths

## Testing Approach (future)

- Vitest for unit tests
- Component tests with @vue/test-utils
- Engine modules are pure functions / classes — highly testable in isolation
- Playwright for E2E tests
