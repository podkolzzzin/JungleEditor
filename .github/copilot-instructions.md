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

## Testing Approach

- **Playwright** for E2E tests — located in `e2e/`
- Vitest for unit tests (future)
- Component tests with @vue/test-utils (future)
- Engine modules are pure functions / classes — highly testable in isolation

### E2E Test Suites (Playwright)

| File | Flow Covered |
|------|-------------|
| `e2e/01-open-video.spec.ts` | Import / open a video file into the media bin |
| `e2e/02-add-to-timeline.spec.ts` | Add media from the bin onto the timeline |
| `e2e/03-cut-clip.spec.ts` | Split (cut) a clip using the toolbar or cut tool |
| `e2e/04-render-export.spec.ts` | Open export dialog, run export, verify completion |

### MANDATORY: Run E2E Tests After Every Change

**After making ANY code change** to files under `src/`, you MUST run the E2E test suite to verify nothing is broken:

```bash
npm run test:e2e
```

If any test fails, **fix the regression before considering the task complete**. Do not skip or disable tests unless explicitly asked by the user.

If you add new user-facing features, **add a corresponding E2E test** in `e2e/` following the existing patterns.

### Test Conventions

- Test files are named `NN-feature-name.spec.ts` (numbered for execution order clarity)
- All interactive elements must have `data-testid` attributes
- Use `data-testclass` for querying multiple elements of the same type (e.g., all clips)
- Test fixtures (sample media) live in `e2e/fixtures/`
- Tests use the Vite dev server (auto-started by Playwright via `playwright.config.ts`)

