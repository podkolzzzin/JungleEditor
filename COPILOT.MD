# JungleEditor — Architecture Guide (COPILOT.MD)

> Reference document describing the architectural concepts and module organization.

---

## 1. Architectural Principles

JungleEditor follows a **Core / UI separation** pattern:

| Layer | Location | Dependencies | Runtime |
|-------|----------|-------------|---------|
| **Core** | `src/core/` | Pure TypeScript + `js-yaml` | Any (Node.js, Browser, Deno) |
| **UI** | `src/ui/` | Vue 3, Browser APIs | Browser (Chromium) |
| **Entry** | `src/main.ts` | Wires core → UI | Browser |

### Core layer (`src/core/`)
- Contains **all business logic, data types, and algorithms**
- **Zero Vue imports** — no `ref`, `reactive`, `computed`, `watch`
- **Zero browser API usage** — no `document`, `window`, `navigator`, `FileSystemHandle`, `Canvas`, `WebGPU`
- Could theoretically power a CLI video editor running on Node.js
- Pure functions: input → output, no side effects on global state

### UI layer (`src/ui/`)
- Implements the **browser-based GUI** using Vue 3
- Uses browser-specific APIs: File System Access, WebGPU, Canvas2D, DOM
- Imports types and logic from `src/core/` — never the reverse
- Manages reactive state via a hand-rolled Vue store (`store.ts`)

### Dependency rule
```
  Core ← UI ← Entry
  (core never imports from ui)
```

---

## 2. Module Map

```
src/
├── main.ts                              # Entry point — mounts Vue app
├── core/                                # ── CORE: UI-agnostic logic ──
│   ├── types.ts                         # All data types + utility fns
│   ├── timeline/                        # Timeline business logic
│   │   ├── index.ts                     # Barrel re-export
│   │   ├── constants.ts                 # Zoom/PPS limits, track colors
│   │   ├── format.ts                    # Time formatting/parsing
│   │   ├── clip-helpers.ts              # Clip speed, duration, opacity, active clip resolution
│   │   └── operations.ts               # Split, total duration, blade cut
│   └── project/                         # Project file format logic
│       ├── index.ts                     # Barrel re-export
│       ├── source-format.ts             # .source file serialize/parse
│       ├── timeline-format.ts           # .timeline YAML serialize/parse
│       └── tree-builder.ts              # Build FileNode tree from flat metadata
└── ui/                                  # ── UI: Vue + Browser layer ──
    ├── App.vue                          # Root layout shell
    ├── store.ts                         # Reactive store (Vue refs, FS Access API)
    ├── persistence.ts                   # In-memory file handle cache
    ├── project.ts                       # FS Access API I/O (delegates format to core)
    ├── style.css                        # Global CSS variables (VS Code dark theme)
    ├── fs-access.d.ts                   # Browser API type shims
    └── components/
        ├── ActivityBar.vue              # Left icon bar
        ├── FileTree.vue                 # Sidebar file browser
        ├── FileTreeNode.vue             # Single tree node (recursive)
        ├── LandingScreen.vue            # Project open/create screen
        ├── StatusBar.vue                # Bottom status bar
        ├── VideoPreview.vue             # Standalone video player
        └── timeline/
            ├── TimelineEditor.vue       # Shell: tab bar + layout + keyboard shortcuts
            ├── TimelinePlayer.vue       # WebGPU/Canvas2D video compositor
            ├── TimelineTracks.vue       # Track lanes, ruler, playhead, toolbar
            ├── ClipBlock.vue            # Single clip block on a track
            ├── ClipInspector.vue        # Clip property editor
            ├── TimelinePreview.vue      # (Legacy) Simple <video> preview
            ├── compositor.ts            # WebGPU renderer + re-exports clip helpers
            └── useTimeline.ts           # Vue composable: all timeline UI state + logic
```

---

## 3. Core Modules in Detail

### 3.1 `core/types.ts`
Central type definitions used by both core and UI:
- **`FileNode`** — project file tree node (handle is `unknown` to avoid browser coupling)
- **`SourceMetadata`** — parsed .source file data
- **`TimelineDocument`**, **`TimelineTrack`**, **`TimelineClip`**, **`TimelineOperation`** — timeline data model
- **`TimelineSourceMeta`**, **`FolderMeta`** — supporting metadata types
- **`isTimelineNode()`**, **`findNodeById()`** — pure utility functions on the data model

### 3.2 `core/timeline/`
All timeline business logic as pure functions:

| File | Exports | Purpose |
|------|---------|---------|
| `constants.ts` | `MIN_PPS`, `MAX_PPS`, `DEFAULT_PPS`, `DEFAULT_CLIP_DURATION`, `TRACK_COLORS`, `trackColor()` | Configuration values |
| `format.ts` | `formatTime()`, `formatTimeFull()`, `parseTimeInput()` | Time ↔ string conversion |
| `clip-helpers.ts` | `getClipSpeed()`, `getClipEffectiveDuration()`, `computeClipOpacity()`, `isClipMuted()`, `findActiveClip()` | Per-clip calculations |
| `operations.ts` | `computeTotalDuration()`, `splitClipInTrack()`, `splitAllAtPlayhead()` | Document-level mutations |

### 3.3 `core/project/`
Project file format serialization — no filesystem I/O:

| File | Exports | Purpose |
|------|---------|---------|
| `source-format.ts` | `serializeSource()`, `parseSource()`, `serializeFolder()`, `parseFolder()` | .source / .folder text format |
| `timeline-format.ts` | `serializeTimeline()`, `parseTimeline()` | .timeline YAML format (uses js-yaml) |
| `tree-builder.ts` | `buildTreeFromSources()` | Builds hierarchical `FileNode[]` from flat metadata lists |

---

## 4. UI Layer in Detail

### 4.1 Store (`ui/store.ts`)
The reactive store uses Vue's `reactive`/`ref` for state and imports helpers from core. It owns:
- Project state: `fileTree`, `projectHandle`, `projectName`, `sourcesDir`
- UI state: `activeFile`, `activeTimeline`, `sidebarOpen`, `loading`
- All CRUD actions: `addVideoFiles`, `removeNode`, `createTimeline`, `saveTimeline`, etc.
- File System Access API interactions (permission, blob URLs, re-linking)

The store wraps core functions with Vue reactivity and browser I/O:
- `isTimelineNode()` → delegates to `core/types.isTimelineNode()`
- `findNode()` → delegates to `core/types.findNodeById()` with default `fileTree`

### 4.2 Project I/O (`ui/project.ts`)
Browser FS Access API layer. Handles read/write of .source, .folder, .timeline files on disk.
Delegates all serialization/parsing to `core/project/` — only provides the I/O wiring.

### 4.3 Timeline Composable (`ui/components/timeline/useTimeline.ts`)
Vue composable that wraps core timeline logic with reactive state:
- Delegates `totalDuration()` → `core/timeline/operations.computeTotalDuration()`
- Delegates `splitClip()` → `core/timeline/operations.splitClipInTrack()`
- Delegates `splitAtPlayhead()` → `core/timeline/operations.splitAllAtPlayhead()`
- Re-exports core constants and formatters for sibling components

### 4.4 Compositor (`ui/components/timeline/compositor.ts`)
WebGPU + Canvas2D renderer. Re-exports clip helper functions from core for backward compatibility with TimelinePlayer imports.

---

## 5. How Core and UI Connect

```
┌──────────────────────────────────┐
│          core/types.ts           │ ← Data types, pure utilities
└──────────┬───────────┬───────────┘
           │           │
    ┌──────▼──────┐  ┌─▼──────────────┐
    │core/timeline│  │ core/project    │ ← Pure logic
    └──────┬──────┘  └─┬──────────────┘
           │           │
    ┌──────▼───────────▼───────────────┐
    │            ui/store.ts           │ ← Reactive state + FS I/O
    │            ui/project.ts         │
    └──────┬───────────────────────────┘
           │
    ┌──────▼───────────────────────────┐
    │     ui/components/ (.vue)        │ ← Vue components
    │     ui/components/timeline/      │
    │       useTimeline.ts             │ ← Vue composable wrapping core
    │       compositor.ts              │ ← WebGPU/Canvas2D renderer
    └──────────────────────────────────┘
```

---

## 6. Guidelines for New Code

### Adding core logic
1. Write pure functions in `src/core/` — no Vue, no browser APIs
2. Export from the relevant barrel index.ts
3. Import in UI layer as needed

### Adding UI features
1. Add state/logic to `useTimeline.ts` (or store for global state)
2. If the logic is **pure** (no Vue, no DOM), put it in core first, then import
3. Vue components receive data via **props** and communicate via **emits**

### Testing the separation
- Core modules should be testable with plain Node.js (no JSDOM needed)
- Run `npx vue-tsc --noEmit` for type checking
- Run `npx playwright test` for e2e tests

---

## 7. Build & Run

```bash
npm run dev          # Start Vite dev server
npm run build        # Type-check + production build
npx vue-tsc --noEmit # Type-check only
npx playwright test  # E2E tests
```

**Browser requirement:** Chromium-based (Chrome, Edge) for File System Access API. WebGPU requires Chrome 113+. Canvas2D fallback available.
