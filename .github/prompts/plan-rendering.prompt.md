# Plan: Timeline Rendering with Background Tasks

> Implementation plan for the video rendering/export pipeline in JungleEditor.
> Follows the Core / UI separation architecture.
>
> **Parallel work note:** This plan is designed to be implemented in parallel with
> `plan-colorGrading.prompt.md`. See §Parallel Integration Contract at the bottom.

---

## TL;DR

Add a complete render/export pipeline following the **Core / UI separation** architecture.
Pure rendering logic (segmenter, fingerprinting, segment format, codec mappings, render
profile data model) goes in `src/core/render/`. UI-specific code (render editor component,
background tasks panel, OPFS/IndexedDB persistence, Web Worker, store state) goes in
`src/ui/`. Render profiles are `.render` files stored in the project. The Render Editor is
a full panel. Rendering uses WebCodecs `VideoEncoder` + `mp4-muxer` in a Web Worker.
A generic Background Tasks panel in the activity bar is the first new sidebar panel.

**Prerequisite**: Resolve the active merge conflict in `src/main.ts` (lines 2–8) before
starting — pick the HEAD (refactored) imports and re-add the store exposure for E2E
testing using the `src/ui/store` path.

---

## Render Options (Essential MVP)

- **Container format**: MP4, WebM
- **Video codec**: H.264, VP9, AV1 (filtered by container + runtime detection via `VideoEncoder.isConfigSupported()`)
- **Resolution presets**: 720p (1280×720), 1080p (1920×1080), 1440p (2560×1440), 4K (3840×2160), Custom
- **Frame rate**: 24, 25, 30, 50, 60 fps, Match Timeline
- **Quality preset**: Low, Medium, High, Lossless (maps to CRF/bitrate internally)
- **Audio**: Toggle include audio on/off, audio bitrate preset when on (128/192/256 kbps AAC)

### Advanced (deferred)

- Bitrate control (CBR/VBR/CRF explicit), 2-pass encoding
- Platform presets (YouTube, social media)
- Audio codec selection (AAC/Opus), sample rate, channels
- Range selection (entire timeline vs in/out range)
- H.265/HEVC, 10-bit output
- Subtitle burn-in, watermark, timecode overlay
- Alpha channel (WebM VP9)

---

## Browser Rendering Pipeline

### Technology Stack

- **WebCodecs API** (`VideoEncoder`, `AudioEncoder`, `VideoDecoder`) — frame-by-frame offline encoding with hardware acceleration
- **mp4-muxer** — MP4 muxing with `StreamTarget` for progressive write to disk
- **mp4box.js** — source MP4 demuxing for `VideoDecoder` in the Web Worker
- **OffscreenCanvas** — Canvas2D rendering in worker (WebGPU-in-worker as future enhancement)
- **OfflineAudioContext** — audio mixing per segment (respects speed, fade, mute operations)
- **File System Access API** — progressive output write via `FileSystemWritableFileStream`
- **OPFS** — intermediate segment storage for resumability
- **IndexedDB** — render job metadata persistence

### Architecture

```
Main Thread                          Render Worker
─────────────                        ─────────────
showSaveFilePicker()                 Receives doc + profile + source ArrayBuffers
Read source files from project       MP4Box demux → VideoDecoder (per source)
Transfer to worker                   OffscreenCanvas + Canvas2D compositing
                                     findActiveClip() → draw frame → VideoEncoder
← progress updates (postMessage)     OfflineAudioContext mix → AudioEncoder
← encoded data chunks                mp4-muxer StreamTarget → postMessage data
Write to FileSystemWritableFileStream
Show progress in Background Tasks    Force keyframe at segment boundaries
                                     Backpressure: encodeQueueSize > 5
```

---

## Resumable & Incremental Rendering

### Segment-Based Architecture

- Timeline is divided into **clip-edge-aligned segments** (boundaries at every clip start/end across all tracks)
- Segments longer than 10s are subdivided; segments shorter than 0.1s are merged
- Each segment is rendered and encoded independently, stored in OPFS
- Final step: concatenate all segments via fragmented MP4 muxing

### Change Detection (Fingerprinting)

- Each segment gets a SHA-256 fingerprint of all inputs: clip sourceId, in/out/offset, **all operations** (speed, fade, mute, **and any future operation types like color_grade or lut**), render profile fields
- On re-render: compare fingerprints — skip unchanged segments (cache hit)
- Editing a clip invalidates only segments referencing it; changing render profile invalidates all
- **Fingerprint includes the full `operations` array** — so when color grading operations are added by the parallel color grading plan, they automatically affect cache invalidation without any rendering code changes

### Resume Points

- Job state persisted to IndexedDB after each completed segment
- On tab close/crash: interrupted segments reset to `pending`, pick up from last completed
- `beforeunload` event warns user during active render
- On app startup: `checkForResumableJobs()` detects incomplete jobs

### Storage

- **OPFS** (`jungle-renders/{jobId}/segment-NNNN.fmp4`) for encoded segment binary data
- **IndexedDB** (`jungle-render` database) for `RenderJob` metadata

---

## Steps

### Phase 1: Core Types & Data Model (`src/core/`)

1. **Add render types to `src/core/types.ts`**
   - `RenderProfile`: `name`, `container: 'mp4' | 'webm'`, `videoCodec: string`, `resolution: { width, height, label }`, `fps`, `qualityPreset: 'low' | 'medium' | 'high' | 'lossless'`, `includeAudio`, `audioBitrate`
   - `RenderDocument`: `name`, `timelineId`, `timelineName`, `profile: RenderProfile`, `created`, `modified`
   - `BackgroundTask`: `id`, `type: string`, `label`, `status: 'queued' | 'running' | 'paused' | 'complete' | 'failed'`, `progress` (0–1), `startedAt?`, `completedAt?`, `error?`, `canPause`, `canCancel`
   - `RenderTask` (extends `BackgroundTask`): `type: 'render'`, `renderJobId`, `timelineName`, `profileName`, `currentSegment`, `totalSegments`, `estimatedRemaining`
   - `RenderSegmentMeta`: `index`, `startTime`, `endTime`, `duration`, `fingerprint`, `status`, `framesRendered`, `totalFrames`, `fileSize?`, `opfsPath`
   - `RenderJob`: `id`, `timelineName`, `status`, `profile`, `timelineSnapshot: TimelineDocument`, `segments: RenderSegmentMeta[]`, `progress`
   - `isRenderNode(node: FileNode): boolean` utility alongside `isTimelineNode()`
   - `RESOLUTION_PRESETS` constant array

2. **Create `src/core/render/` module — pure rendering logic**
   - `src/core/render/index.ts` — barrel re-export
   - `src/core/render/segmenter.ts` — `computeSegments(doc, maxDuration?, minDuration?): RenderSegment[]` (clip-edge-aligned), `resolveActiveClips(doc, startTime, endTime): SegmentClipRef[]`. Imports from `../timeline/clip-helpers`
   - `src/core/render/fingerprint.ts` — `buildFingerprintInput(segment, profile)`, `computeFingerprint(input): Promise<string>` (SHA-256 via `crypto.subtle`). **Includes the full `clip.operations` array in the fingerprint** so any new operation type (color_grade, lut, etc.) automatically invalidates affected segments
   - `src/core/render/segment-format.ts` — `serializeSegmentData(videoChunks, audioChunks, fingerprint, duration): Uint8Array`, `deserializeSegmentData(data): {...}` — binary envelope
   - `src/core/render/codec-map.ts` — `CODEC_REGISTRY` mapping user-facing names to WebCodecs codec strings, container↔codec compatibility, quality↔bitrate mappings

3. **Add `.render` format to `src/core/project/`**
   - `src/core/project/render-format.ts` — `serializeRender(doc: RenderDocument): string` (YAML), `parseRender(text): RenderDocument | null`
   - Update `src/core/project/index.ts` — re-export new functions
   - Update `src/core/project/tree-builder.ts` — accept render metadata, nest `.render` nodes under parent timeline (by `timelineId`)

### Phase 2: UI File I/O & Store (`src/ui/`)

4. **Add `.render` file operations to `src/ui/project.ts`**
   - `writeRenderFile(sourcesDir, renderId, doc: RenderDocument)`
   - `readRenderFile(sourcesDir, renderId): RenderDocument | null`
   - `deleteRenderFile(sourcesDir, renderId)`
   - Update `readAllSources()` — add `.render` branch in the `for await` loop, collect render metadata
   - Return render metadata so `buildTreeFromSources()` can place them

5. **Add state to `src/ui/store.ts`**
   - `backgroundTasks = reactive<BackgroundTask[]>([])`, `activeRender = ref<RenderDocument | null>(null)`
   - Task CRUD: `addTask()`, `updateTask()`, `removeTask()`, `getTask()` — generic
   - `createRenderProfile(timelineNode, profileName)` — follows `createTimeline()` pattern
   - `openRenderProfile(node)` — reads `.render`, sets `activeRender`
   - `saveRenderProfile()` — writes `activeRender` to disk
   - Re-export `isRenderNode` from core

6. **Create `src/ui/render-store.ts`** — IndexedDB persistence
   - `saveRenderJob()`, `loadRenderJob()`, `listRenderJobs()`, `deleteRenderJob()`
   - `checkForResumableJobs()` — find interrupted jobs

7. **Create `src/ui/render-opfs.ts`** — OPFS segment storage
   - `writeSegmentFile()`, `readSegmentFile()`, `deleteJobFiles()`, `getStorageEstimate()`

### Phase 3: Render Engine (browser-specific, `src/ui/`)

8. **Create `src/ui/render/frame-renderer.ts`** — compositing abstraction
   - **This is the key integration point with color grading.**
   - Defines the `FrameRenderer` interface:
     ```
     interface FrameRenderer {
       init(width: number, height: number): Promise<void>
       renderFrame(videoFrame: VideoFrame, clip: TimelineClip, localTime: number): VideoFrame
       destroy(): void
     }
     ```
   - Initial implementation: `Canvas2DFrameRenderer` — uses `OffscreenCanvas` with Canvas2D
     - Draws the decoded `VideoFrame` with opacity from `computeClipOpacity()`
     - **Extension point:** Calls `applyOperations(ctx, clip, localTime)` which is a no-op for unknown operation types. When color grading operations exist, this function is the place to apply them (e.g., Canvas2D filter string for basic adjustments, or `getImageData()`→LUT→`putImageData()` for LUTs)
   - Future: `WebGPUFrameRenderer` — reuses the same WGSL shader code as the live compositor (extracted to a shared module, see §Parallel Integration Contract)
   - The renderer is **operation-aware**: it reads `clip.operations` and applies all visual effects it understands, skipping unknown types gracefully

9. **Create render worker: `src/ui/render/render-worker.ts`**
   - Web Worker entry (Vite: `new Worker(new URL(...), { type: 'module' })`)
   - Receives timeline doc + profile + source ArrayBuffers (transferred)
   - Uses `FrameRenderer` from step 8 for compositing
   - Per segment: MP4Box demux → VideoDecoder → FrameRenderer.renderFrame() → VideoEncoder (H.264 HW) → AudioEncoder (AAC via OfflineAudioContext) → serialize → postMessage back
   - Backpressure (`encodeQueueSize > 5`), cancel support, progress reporting

10. **Create orchestrator: `src/ui/render/use-render.ts`**
    - `useRender()` composable: `progress`, `isRendering`, `startRender()`, `resumeRender()`, `pauseRender()`, `cancelRender()`, `checkForResumableJobs()`
    - Flow: segments → fingerprint → cache check → spawn worker → persist after each segment → concatenate → `showSaveFilePicker()` → progressive write

11. **Create `src/ui/render/codec-detect.ts`** — runtime codec detection
    - `detectSupportedCodecs()` via `VideoEncoder.isConfigSupported()` / `AudioEncoder.isConfigSupported()`
    - Filters render editor dropdowns to supported codecs only

### Phase 4: UI Components

12. **Create `src/ui/components/render/RenderEditor.vue`**
    - Full editor panel (replaces TimelineEditor/VideoPreview when `.render` file selected)
    - Settings form (ClipInspector `.insp-field` styling): container, codec, resolution, FPS, quality, audio toggle
    - Render controls: "Render" button, progress bar, pause/cancel, estimated time/size

13. **Create `src/ui/components/ContextMenu.vue`**
    - Generic: `items[]`, x/y positioning, click-outside/Escape close
    - VS Code dark theme styling

14. **Add context menu to `src/ui/components/FileTreeNode.vue`**
    - `@contextmenu.prevent` on file item div
    - Timeline files: "Create Render Profile" option
    - Render files: "Delete", "Rename"
    - Emit through FileTree.vue

15. **Add render button to `src/ui/components/timeline/TimelineEditor.vue`**
    - In tab bar next to save button — "Render" with export icon
    - Creates default `.render` profile if none exists, or opens first existing one

16. **Create `src/ui/components/BackgroundTasks.vue`**
    - Sidebar panel (activity bar `'tasks'` selection)
    - Generic `BackgroundTask` list — icon, label, status badge, progress bar
    - Render tasks: segment progress, ETA
    - Actions: Pause/Cancel/Remove per task
    - Empty state: "No background tasks"

17. **Add Tasks icon to `src/ui/components/ActivityBar.vue`**
    - New button in `.top-icons` after Explorer
    - Active class: `active === 'tasks' && sidebarOpen`
    - Optional badge showing running task count

18. **Update `src/ui/App.vue`**
    - Import BackgroundTasks + RenderEditor
    - Sidebar: `<BackgroundTasks v-else-if="activePanel === 'tasks'" />`
    - Editor area: `<RenderEditor v-else-if="showRender" />` (between TimelineEditor and VideoPreview)
    - `showRender` computed using `isRenderNode(activeFile)`

### Phase 5: Dependencies

19. **Install packages**
    - `mp4-muxer` (production) — MP4 muxing with StreamTarget
    - `mp4box` (production) — source demuxing for VideoDecoder
    - `@types/dom-webcodecs` (dev, if needed)

### Phase 6: Tests

20. **E2E test updates**
    - Update `e2e/fs-mock-init.js` to handle `.render` files
    - New tests in `e2e/editor.spec.ts`:
      - Context menu on timeline → "Create Render Profile" → `.render` in tree
      - Click `.render` → Render Editor with settings form
      - Background Tasks panel from activity bar
    - All existing tests must pass

---

## Verification

```bash
npx vue-tsc --noEmit   # Zero type errors
npx playwright test     # All tests pass
```

Manual: create render profile → configure → render → verify MP4 output is playable

---

## Parallel Integration Contract (with Color Grading Plan)

> This section defines how the rendering and color grading plans interact so they can
> be implemented simultaneously without conflicts.

### Shared Files — Ownership Rules

| File | Rendering owns | Color Grading owns | Contract |
|------|---------------|-------------------|----------|
| `src/core/types.ts` | `RenderProfile`, `RenderDocument`, `BackgroundTask`, `RenderJob`, `isRenderNode()`, `RESOLUTION_PRESETS` | `'color_grade'` and `'lut'` additions to `TimelineOperation.type`, new operation fields, `ColorGradeParams` | Both add to `TimelineOperation.type` union — **additive, no conflict**. Each plan appends new types to the union and new optional fields. |
| `src/core/timeline/clip-helpers.ts` | No changes | Adds `getClipColorGrade()`, extends `ActiveClipInfo` with `colorGrade` field | Rendering imports `findActiveClip()` and `ActiveClipInfo` — any new fields are **optional**, so rendering code compiles without color grading. |
| `src/ui/components/timeline/compositor.ts` | No changes (rendering has its own `FrameRenderer`) | Expands shader, bind group, `renderFrame()` signature, adds LUT texture management | **No conflict** — rendering does NOT modify the live compositor. It has its own `FrameRenderer` in `src/ui/render/frame-renderer.ts`. |
| `src/ui/store.ts` | Adds `backgroundTasks`, `activeRender`, render CRUD | Adds `lutCache`, `addLutFiles()` | Different state slices — **no conflict** |
| `src/ui/components/timeline/ClipInspector.vue` | No changes | Adds color_grade/lut operation UI | **No conflict** |
| `src/ui/components/timeline/TimelineEditor.vue` | Adds Render button in tab bar | Adds Color tab | Different areas of the template — **low conflict risk** |
| `src/ui/App.vue` | Adds BackgroundTasks sidebar + RenderEditor panel | No changes | **No conflict** |

### How Rendering Automatically Picks Up Color Grading

1. **Fingerprinting**: The fingerprint includes the full `clip.operations` array (serialized to JSON). When a `color_grade` or `lut` operation is added/modified, the fingerprint changes → segments are re-rendered. **No rendering code changes needed.**

2. **Frame rendering**: The `FrameRenderer` interface (step 8) processes `clip.operations` in its `renderFrame()` method. The initial Canvas2D implementation applies opacity and skips unknown operation types gracefully. When color grading lands:
   - **If color grading lands first**: The `FrameRenderer` is updated to apply color grade operations (via Canvas2D filters or pixel manipulation). Rendering automatically uses it.
   - **If rendering lands first**: The `FrameRenderer` renders frames without color corrections (they don't exist yet). When color grading is merged, a follow-up PR adds operation handling to `FrameRenderer`.
   - **If both land simultaneously**: The merge adds color operation handling to `FrameRenderer` as part of the integration.

3. **Future WebGPU path**: When the render worker is upgraded to `WebGPUFrameRenderer`, it should import the **same WGSL shader code** used by the live compositor. To enable this:
   - **Color grading should extract the WGSL shader string** to a shared location: `src/ui/components/timeline/shader.ts` (or keep it in `compositor.ts` and export it)
   - The `WebGPUFrameRenderer` imports that shader string and uses it on `OffscreenCanvas` with `VideoFrame` textures instead of `HTMLVideoElement` `importExternalTexture`
   
### Merge Checklist (when both plans are complete)

After both feature branches are independently merged:

1. **Verify `FrameRenderer` applies color operations** — if not yet done, add `color_grade` handling to `Canvas2DFrameRenderer.applyOperations()`:
   - Read `ColorGradeParams` from the clip (using `getClipColorGrade()` from core)
   - Apply via Canvas2D filters: `ctx.filter = 'brightness(...) contrast(...) saturate(...)'`
   - For LUT operations: use the `applyLutToImageData()` function from the lut module

2. **Verify fingerprint invalidation** — change a color grade slider, re-render, confirm the segment is re-encoded (not cached)

3. **Extract WGSL shader to shared module** (if not already done) for the future WebGPU render worker path

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Core/UI split respected | Pure logic in `core/render/`, browser APIs in `ui/` |
| Render UI | Full editor panel | Matches pattern: file type → editor view in App.vue |
| MVP scope | Essential options only | Container, codec, resolution, FPS, quality, audio toggle |
| File naming | `{TimelineName}_{ProfileName}.render` display; `{uuid}.render` on disk | Consistent with project convention |
| Tasks panel | Generic `BackgroundTask` type | Extensible for future task types |
| Rendering | Segment-based, clip-edge-aligned | Enables resume + incremental re-render |
| Segment storage | OPFS for binary data, IndexedDB for metadata | Separate from existing persistence.ts (now in-memory Map) |
| Encoding | WebCodecs + mp4-muxer in Web Worker | Non-blocking offline rendering |
| Output format | Fragmented MP4 | Progressive write, no seek-back needed |
| Worker rendering | Canvas2D first via `FrameRenderer` | WebGPU-in-worker later; `FrameRenderer` interface allows swapping |
| `crypto.subtle` in core | Allowed | Available in both browser and Node 15+ |
| Compositor isolation | Rendering does NOT modify `compositor.ts` | Avoids merge conflicts with color grading; uses separate `FrameRenderer` |
| Fingerprint scope | Full `operations` array | Auto-invalidates on any operation change (color, speed, fade, future types) |
