# JungleEditor — Agent Knowledge Base

> Internal reference document for AI agents working on this codebase.
> Captures architecture, key decisions, gotchas, and patterns accumulated during development.

---

## 1. Project Overview

**JungleEditor** is a browser-based non-linear video editor (NLE) built with:

| Tech | Version | Role |
|------|---------|------|
| Vue 3 | 3.5.30 | UI framework, Composition API + `<script setup>` |
| TypeScript | 5.9.3 | Strict mode, `erasableSyntaxOnly` |
| Vite | 8.0.3 | Dev server + build tool |
| vue-tsc | 3.2.5 | Type-checking for Vue SFCs |
| js-yaml | 4.1.1 | Timeline file serialization (YAML `.timeline` files) |
| WebGPU | Browser API | GPU-accelerated video frame rendering |
| File System Access API | Chromium-only | Project folder I/O (read/write files) |

**No router, no Vuex/Pinia** — state is managed via a hand-rolled reactive store (`store.ts`).

---

## 2. Project Structure

```
src/
├── App.vue                     # Root — layout shell, sidebar toggle, panel switching
├── main.ts                     # Entry point
├── types.ts                    # Central type definitions (FileNode, Timeline*, SourceMetadata)
├── store.ts                    # Reactive store (~600 lines) — project state, file tree, CRUD
├── persistence.ts              # IndexedDB helpers for FileSystemFileHandle persistence
├── project.ts                  # .source/.timeline file I/O against the project directory
├── style.css                   # Global CSS variables (VS Code dark theme)
├── fs-access.d.ts              # Type shims for File System Access API
├── components/
│   ├── ActivityBar.vue         # Left icon bar (explorer, etc.)
│   ├── FileTree.vue            # Sidebar file browser
│   ├── FileTreeNode.vue        # Single tree node (recursive)
│   ├── LandingScreen.vue       # "Open/Create project" landing
│   ├── StatusBar.vue           # Bottom status bar
│   ├── VideoPreview.vue        # Standalone video preview (non-timeline)
│   └── timeline/               # ← Timeline editor module (see §3)
│       ├── TimelineEditor.vue  # Thin shell — tab bar + layout, wires sub-components
│       ├── TimelinePlayer.vue  # Custom video player with WebGPU compositor
│       ├── TimelinePreview.vue # (Legacy) Simple <video> preview — superseded by Player
│       ├── TimelineTracks.vue  # Track lanes, ruler, playhead, toolbar
│       ├── ClipBlock.vue       # Single clip block on a track
│       ├── ClipInspector.vue   # Clip property editor (in/out/offset/operations)
│       ├── compositor.ts       # WebGPU renderer + Canvas2D fallback + clip helpers
│       └── useTimeline.ts      # Composable — ALL timeline state + logic
```

---

## 3. Timeline Architecture

### 3.1 Data Model (`types.ts`)

```
TimelineDocument
  ├── name, created, modified, resolution?, fps?
  └── tracks: TimelineTrack[]
        ├── name: string
        └── clips: TimelineClip[]
              ├── sourceId     → links to FileNode.sourceId
              ├── sourceName?  → human-readable (stored in YAML)
              ├── in / out     → source video time range (seconds)
              ├── offset?      → position on the timeline (seconds from 0)
              └── operations?: TimelineOperation[]
                    ├── type: 'cut' | 'remove_segment' | 'speed' | 'fade_in' | 'fade_out' | 'mute'
                    └── type-specific fields (at, from, to, rate, duration)
```

**Key concept:** `in`/`out` are source-video timestamps. `offset` is the clip's start position on the global timeline. When a clip has a `speed` operation, its *effective duration* on the timeline is `(out - in) / speed`.

### 3.2 Composable Pattern (`useTimeline.ts`)

All timeline state and logic lives in a single composable `useTimeline()`. Sub-components receive data via **props** and communicate back via **emits**.

**Exports from the module (non-composable):**
- Constants: `MIN_PPS`, `MAX_PPS`, `DEFAULT_PPS`, `DEFAULT_CLIP_DURATION`, `TRACK_COLORS`
- Formatters: `formatTime()`, `formatTimeFull()`, `parseTimeInput()`, `trackColor()`
- Types: `TrimEdge`, `ClipSelection`

**`useTimeline()` returns ~40 values:**
- **Reactive state:** `doc`, `dirty`, `selectedClip`, `globalPlayhead`, `isPlaying`, `dragOverTrack`, `dragOverNewTrack`, `pixelsPerSecond`, `tracksScrollEl`, `clipDrag`, `clipDragTargetTrack`, `edgeDrag`
- **Computed/helpers:** `clipWidth()`, `clipOffsetPx()`, `totalDuration()`, `timelineWidth()`, `rulerMarks()`, `inspectedClip`
- **Actions:** `markDirty()`, `addTrack()`, `removeTrack()`, `removeClip()`, `selectClip()`, `splitAtPlayhead()`, `togglePlay()`, `seekTo()`, `onSave()`
- **Event handlers:** Drag/drop (6), zoom (4), clip drag (1), edge trim (1)
- **Store re-exports:** `activeFile`, `activeTimeline`

### 3.3 Component Roles

| Component | Responsibility | Key pattern |
|-----------|---------------|-------------|
| `TimelineEditor.vue` | Shell: tab bar, layout, keyboard shortcuts (Space = play/pause). Destructures `useTimeline()` and passes everything to children via props/emits. | ~130 template lines |
| `TimelinePlayer.vue` | WebGPU-composited video playback. Manages `<canvas>`, hidden `<video>` elements per source, `requestAnimationFrame` loop, transport controls. | Self-contained — receives `doc`, `globalPlayhead`, `isPlaying`, `totalDuration` |
| `TimelineTracks.vue` | Toolbar, ruler, scrollable track lanes, playhead line. Click ruler to seek. Drag playhead handle. | Emits `seek`, `toggle-play`, `split`, zoom, drag events |
| `ClipBlock.vue` | Single clip: colored block, trim handles, name, duration, operation dots, remove button. | Pure presentational — all via props/emits |
| `ClipInspector.vue` | Property panel: source, in/out/duration/offset fields, operations CRUD. | Mutates clip directly (reactive proxy), emits `dirty` |

### 3.4 Compositor (`compositor.ts`)

**Architecture:**
1. **Clip helpers** (pure functions, no GPU dependency):
   - `getClipSpeed(clip)` — reads `speed` operation rate
   - `getClipEffectiveDuration(clip)` — `(out - in) / speed`
   - `computeClipOpacity(clip, localTime)` — applies `fade_in`/`fade_out`
   - `isClipMuted(clip)` — checks for `mute` operation
   - `findActiveClip(tracks, time)` → `ActiveClipInfo | null` — resolves which clip plays at a given global time

2. **`TimelineCompositor` class:**
   - `init(canvas)` — tries WebGPU, falls back to Canvas2D
   - `renderFrame(video, opacity)` — draws one video frame with opacity
   - `renderBlack()` — clears to black
   - `destroy()` — cleanup

**WebGPU pipeline:**
- Full-screen quad (6 vertices, no vertex buffer)
- `texture_external` for zero-copy video frame import
- Uniform buffer for opacity
- WGSL shader: samples video texture, multiplies by opacity

**Canvas2D fallback:** `drawImage()` with `globalAlpha` for opacity, letterboxing for aspect ratio.

### 3.5 Global Playhead & Playback

The **global playhead** (`globalPlayhead` ref, in seconds) is the single source of truth for "where are we in the timeline." It drives:

1. **TimelinePlayer:** Uses `findActiveClip()` to determine which video source to show at the current time, seeks the hidden `<video>` to the correct source time, renders via compositor
2. **TimelineTracks:** Renders a red vertical line at the playhead position, with a draggable triangle handle
3. **Split at playhead:** `splitAtPlayhead()` iterates all tracks in reverse, finds clips under the playhead, computes source time, and splits them

**Playback loop:** `requestAnimationFrame` in TimelinePlayer. Each tick: compute delta time → advance `globalPlayhead` → find active clip → seek video → render frame. Stops at `totalDuration`.

### 3.6 Split Logic

`splitAtPlayhead()`:
- Iterates tracks/clips in **reverse** (to handle index shifts from splicing)
- For each clip that spans the playhead: computes `sourceTime = clip.in + (playheadTime - clipOffset) * speed`
- Creates right clip with: `in = sourceTime`, `out = originalOut`, `offset = originalOffset + (sourceTime - originalIn) / speed`
- Left clip keeps `fade_in`, right clip keeps `fade_out` (operations are distributed intelligently)
- Minimum clip duration: 0.2s, with 0.05s guard at edges

---

## 4. Key Patterns & Conventions

### 4.1 Vue Patterns
- **`<script setup>`** everywhere — no Options API
- **`defineModel()`** for two-way binding (e.g., `tracksScrollEl`, `videoEl`)
- **`defineEmits<{...}>()`** with typed tuple signatures
- **Scoped CSS** in every component — no CSS modules, no Tailwind
- **CSS variables** from `style.css` (VS Code dark theme: `--editor-bg`, `--sidebar-fg`, `--accent-color`, `--border-color`, `--mono`, `--sans`, etc.)

### 4.2 Drag & Drop
- **File tree → Timeline:** HTML5 drag/drop with custom MIME type `application/x-jungle-clip` carrying JSON `{ sourceId, sourceName }`
- **Clip repositioning:** `mousedown` → `mousemove` → `mouseup` on `window` (not element — allows dragging outside bounds). Tracks cursor Y to detect cross-track moves via `getTrackIndexAtY()`.
- **Edge trim:** Same mousedown/window pattern. Left handle adjusts `in` + `offset`, right handle adjusts `out`.

### 4.3 Zoom
- `pixelsPerSecond` (4–200, default 20) controls all layout
- Ctrl+Scroll zooms around cursor position (computing `timeAtCursor` before/after)
- Buttons: ×1.4 steps. Scroll: ×1.15 steps.

### 4.4 TypeScript Strictness
- `noUnusedLocals: true`, `noUnusedParameters: true` — must prefix unused params with `_`
- `erasableSyntaxOnly: true` — no `enum`, no `namespace`, no parameter properties
- Build command: `vue-tsc -b && vite build`
- Type-check: `npx vue-tsc --noEmit`

---

## 5. File Formats

### `.timeline` (YAML, managed by `project.ts`)
```yaml
name: My Timeline
created: "2026-03-30T..."
modified: "2026-03-30T..."
tracks:
  - name: Track 1
    clips:
      - sourceId: abc-123
        sourceName: interview.mp4
        in: 10.5
        out: 25.0
        offset: 0
        operations:
          - type: speed
            rate: 1.5
          - type: fade_in
            duration: 1.0
```

### `.source` (plain text, one per imported file)
```
id: <uuid>
name: original-filename.mp4
size: 12345678
type: video/mp4
added: 2026-03-30T...
path: /subfolder
```

---

## 6. Gotchas & Lessons Learned

### 6.1 WebGPU
- `importExternalTexture()` **throws** if the video element isn't ready (`readyState < 2`). Always wrap in try/catch.
- External textures are only valid for the current frame — must recreate bind group every render.
- WebGPU types (`GPUDevice`, `GPUCanvasContext`, etc.) require `@webgpu/types` or `@types/dom-webgpu` **or** a sufficiently recent `lib` in tsconfig. The project uses `@vue/tsconfig/tsconfig.dom.json` as base.
- `navigator.gpu` may be `undefined` — always feature-detect before use.
- Canvas must use `getContext('webgpu')` — cannot switch between webgpu and 2d contexts.

### 6.2 Vue Component Communication
- When splitting a large component, use a **composable** for shared state rather than provide/inject (simpler, more explicit).
- Props flow down, emits flow up. For deeply nested events (ClipBlock → TimelineTracks → TimelineEditor), each level re-emits.
- `defineModel()` is great for bidirectional refs like element references that a parent needs.

### 6.3 Clip Duration vs. Effective Duration
- **Source duration** = `clip.out - clip.in` (seconds in the original video)
- **Effective duration** = source duration / speed (how long it appears on the timeline)
- Layout functions (`clipWidth`, `totalDuration`) must use effective duration.
- Split calculations must convert between timeline time and source time: `sourceTime = clip.in + localTime * speed`

### 6.4 Index Management During Splits
- When splitting multiple clips (blade cut), iterate clips in **reverse** to avoid index invalidation from `splice()`.

### 6.5 Event Handler Patterns
- Mouse drag operations (clip move, edge trim, playhead drag) all follow the same pattern:
  1. `mousedown` on element → capture start state, add `window` listeners
  2. `mousemove` on `window` → update state
  3. `mouseup` on `window` → finalize, remove listeners
  4. `onBeforeUnmount` → cleanup listeners (defensive)

### 6.6 Performance
- Ruler marks are computed as a function (not a computed ref) because they depend on `pixelsPerSecond` and `timelineWidth()` which are both called in the template.
- The playback RAF loop in TimelinePlayer is the only animation driver — the timeline playhead moves because `globalPlayhead` is a reactive ref that TimelineTracks watches.
- Video elements for different sources are cached in a `Map<string, HTMLVideoElement>` to avoid re-creation.

---

## 7. Common Tasks

### Adding a new operation type
1. Add to `TimelineOperation.type` union in `types.ts`
2. Add operation-specific fields to `TimelineOperation`
3. Handle in `ClipInspector.vue` (add to select, add input template)
4. Handle in `compositor.ts` if it affects rendering (e.g., visual effect)
5. Handle in `useTimeline.ts` `splitClip()` if it should be distributed on split

### Adding a new timeline feature
1. Add state/logic to `useTimeline.ts`
2. Add it to the return object
3. Destructure in `TimelineEditor.vue`
4. Pass as props/emits to the relevant sub-component

### Debugging playback
- Check `TimelinePlayer.vue` → `renderCurrentFrame()` — this is called every RAF tick
- Check `compositor.ts` → `findActiveClip()` — this resolves which clip is active
- Check that video sources are preloaded (`preloadSources()` runs on doc change)

---

## 8. CSS Theme Variables (from `style.css`)

```css
--editor-bg       /* Main editor background */
--titlebar-bg     /* Tab bar / title bar */
--sidebar-bg      /* Sidebar background */
--sidebar-fg      /* Sidebar text */
--sidebar-fg-dim  /* Dimmed sidebar text */
--border-color    /* All borders */
--accent-color    /* Selection, highlights (#007acc) */
--tab-fg          /* Tab text */
--tab-active-fg   /* Active tab text */
--list-hover      /* List item hover background */
--mono            /* Monospace font family */
--sans            /* Sans-serif font family */
```

---

## 9. Build & Run

```bash
npm run dev          # Start Vite dev server
npm run build        # Type-check + production build
npx vue-tsc --noEmit # Type-check only (no output)
```

**Browser requirement:** Chromium-based (Chrome, Edge) for File System Access API. WebGPU requires Chrome 113+ with appropriate flags, or newer Chrome/Edge versions where it's enabled by default. Canvas2D fallback works everywhere.

---

## 10. Mandatory Verification (REQUIRED)

> **Every agent MUST run the following checks after ANY code change. No exceptions.**

### 10.1 Type-check

```bash
npx vue-tsc --noEmit
```

Must exit with code 0. Fix all type errors before proceeding.

### 10.2 E2E Tests

```bash
npx playwright test
```

Must exit with code 0 — **all tests must pass**. If a test fails, fix the code or update the test before considering the task complete.

### Workflow

1. Make your code changes.
2. Run `npx vue-tsc --noEmit` — fix any type errors.
3. Run `npx playwright test` — fix any test failures.
4. Only report the task as done when **both commands pass**.

### E2E Test Infrastructure

| Item | Location |
|------|----------|
| Playwright config | `playwright.config.ts` |
| Test specs | `e2e/*.spec.ts` |
| FS Access API mock | `e2e/fs-mock-init.js` |
| Test video fixture | `e2e/fixtures/test-video.mp4` |
| CI workflow | `.github/workflows/e2e.yml` |

The E2E tests mock the File System Access API in-memory (no real OS dialogs) and cover: project creation, file addition, timeline creation, zoom, seek, play/pause, and navigation. Video recordings of each test run are saved to `test-results/` and uploaded as CI artifacts.

### When to update tests

- **New UI feature or component** → add test coverage in `e2e/editor.spec.ts` or a new spec file.
- **Changed selectors / DOM structure** → update affected locators in existing tests.
- **Changed store / data model** → verify `e2e/fs-mock-init.js` still covers the required API surface.
