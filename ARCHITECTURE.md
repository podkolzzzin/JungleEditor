# Jungle Editor — Architecture

## Overview

Jungle Editor is a **full-featured, browser-native video editor** built with modern Web APIs for near-native performance. It runs entirely client-side with no server dependency for editing operations.

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| UI Framework | **Vue 3** (Composition API, `<script setup>`) | Reactive UI, component system |
| Build Tool | **Vite 6** | Dev server, HMR, production builds |
| Language | **TypeScript 5.8** (strict mode) | Type safety across the codebase |
| State Management | **Pinia 3** | Centralised project state |
| Routing | **Vue Router 4** | SPA navigation |
| Video Decode/Encode | **WebCodecs API** | Hardware-accelerated codec access |
| GPU Rendering | **WebGPU API** | Frame compositing, effects, color grading |
| Audio | **Web Audio API** | Real-time mixing, effects, metering |
| Concurrency | **Web Workers + SharedArrayBuffer** | Off-main-thread processing |
| File I/O | **File System Access API / OPFS** | Read/write project & media files |
| Streaming | **Streams API (BYOB)** | Progressive read/write of large media |
| Containers | **MP4Box.js / mp4-muxer** | Demux/mux MP4 and WebM |

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Vue 3 UI Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Toolbar  │  │ Preview  │  │ Timeline │  │Properties│ │
│  │  Panel   │  │  Panel   │  │  Panel   │  │  Panel   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │              │             │              │       │
│       └──────────────┴──────┬──────┴──────────────┘       │
│                             │                             │
│                      ┌──────┴──────┐                      │
│                      │ Pinia Store │                      │
│                      │  (project)  │                      │
│                      └──────┬──────┘                      │
└─────────────────────────────┼────────────────────────────┘
                              │
┌─────────────────────────────┼────────────────────────────┐
│                     Engine Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Render   │  │ Playback │  │ Decoder  │  │  Audio   │ │
│  │ (WebGPU) │  │  (rAF)   │  │(WebCodecs│  │(WebAudio)│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                          │
│  ┌──────────┐  ┌──────────┐                              │
│  │  Export   │  │ Workers  │                              │
│  │ Pipeline  │  │  Pool    │                              │
│  └──────────┘  └──────────┘                              │
└──────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── main.ts                 # App entry point
├── App.vue                 # Root component
├── router/                 # Vue Router config
│   └── index.ts
├── stores/                 # Pinia stores
│   └── project.ts          # Primary project state
├── views/                  # Top-level route views
│   └── EditorView.vue      # Main editor layout
├── components/
│   └── panels/             # Major UI panels
│       ├── ToolbarPanel.vue
│       ├── PreviewPanel.vue
│       ├── TimelinePanel.vue
│       ├── MediaBinPanel.vue
│       └── PropertiesPanel.vue
├── core/                   # Domain types & utilities
│   └── types.ts            # All TypeScript interfaces
├── engine/                 # Performance-critical subsystems
│   ├── render.ts           # WebGPU compositor
│   ├── playback.ts         # Real-time playback loop
│   ├── decoder.ts          # WebCodecs decode service
│   ├── audio.ts            # Web Audio mixing engine
│   └── export.ts           # Encode + mux pipeline
├── composables/            # Vue composables (shared logic)
├── workers/                # Web Worker scripts
└── assets/                 # CSS, fonts, icons
    └── main.css
```

## Key Design Decisions

### 1. WebGPU for Rendering
All video frame compositing runs on the GPU via WebGPU. This enables:
- Multi-layer compositing at 60fps
- GPU-computed color grading, transforms, blend modes
- Texture-based effects (blur, glow, chroma key)
- Shared textures between decode and render (zero-copy when possible)

Fallback: Canvas2D for browsers without WebGPU support.

### 2. WebCodecs for Decode/Encode
WebCodecs provides direct access to hardware codecs without relying on `<video>` elements:
- Frame-accurate seeking (no keyframe dependency for the UI)
- Decode directly to `VideoFrame` → upload to GPU texture
- Encode from GPU readback for export
- Supports H.264, H.265, VP9, AV1

### 3. Off-Main-Thread Processing
CPU-heavy work is offloaded to Web Workers:
- Waveform generation
- Thumbnail extraction
- Audio resampling
- Export encoding

`SharedArrayBuffer` is used for zero-copy data sharing between threads. The Vite config sets the required COOP/COEP headers.

### 4. Non-Destructive Editing Model
All edits are non-destructive:
- Original media is never modified
- Clips reference source media + in/out points
- Effects are parametric and computed at render time
- Full undo/redo via command pattern

### 5. State Management
A single Pinia store (`project`) holds the complete serialisable project state:
- Tracks, clips, effects, transitions
- Media items (metadata + object URLs)
- Playhead position, selection state
- Project settings (resolution, fps, sample rate)

The store is the single source of truth; the engine layer reads from it.

## Performance Targets

| Metric | Target |
|--------|--------|
| Preview framerate | 60fps (1080p, 3 video layers) |
| Seek latency | < 100ms to any frame |
| UI responsiveness | < 16ms main-thread frame budget |
| Export speed | ≥ real-time for H.264 1080p30 |
| Memory | < 2GB for 30-min 1080p project |

## Browser Requirements

- Chrome/Edge 113+ (WebGPU, WebCodecs, OPFS)
- Firefox 130+ (WebGPU behind flag, WebCodecs partial)
- Safari 18+ (WebGPU, WebCodecs partial)

Primary target: Chromium-based browsers for full API support.
