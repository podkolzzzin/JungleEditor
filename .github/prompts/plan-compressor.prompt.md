# Video Compressor Feature — Implementation Plan

## Problem Statement

Add a **video file compressor** to JungleEditor that works entirely in the browser (local-first, no server uploads). The user can right-click a video file in the file tree and compress it, choosing output codec, bitrate, and resolution. The result is saved directly to disk via the File System Access API.

## Research Findings (key takeaways)

**Best approach: WebCodecs + MP4Box.js + mp4-muxer in a Web Worker**

- **WebCodecs** (VideoEncoder/VideoDecoder) — hardware-accelerated, Chrome 94+, already required by JungleEditor (Chromium-only FSA). Much faster than real-time for H.264.
- **MP4Box.js** — demuxes MP4 input, extracts encoded chunks + codec config (`avcC` box) needed by `VideoDecoder`.
- **mp4-muxer** — assembles encoded chunks into an MP4 container, with `StreamTarget` for streaming writes (no full-file-in-RAM).
- **Web Worker** — moves encoding off the main thread so Vue UI stays responsive.
- **FFmpeg.wasm** is NOT needed for the primary path (would require SharedArrayBuffer/COOP-COEP headers and is much slower). Can be a future fallback.

**Critical gotchas to remember during implementation:**
1. `VideoFrame` holds GPU memory — always `.close()` after `encoder.encode(frame)`.
2. Backpressure: throttle frame feeding when `encoder.encodeQueueSize > 5`.
3. Timestamps in WebCodecs are **microseconds**; MP4Box timestamps are `cts / timescale` seconds — convert carefully.
4. Always pass `meta` (second arg) to `muxer.addVideoChunk(chunk, meta)` — contains SPS/PPS for keyframes.
5. Use `firstTimestampBehavior: 'offset'` in mp4-muxer in case source doesn't start at 0.
6. `mp4-muxer`'s `StreamTarget.onData(data, position)` may seek (non-sequential) — File System Access API `write({ type: 'write', position, data })` handles this correctly.
7. Extract `avcC` description box from MP4Box for `VideoDecoder.configure({ description })`.
8. Use `latencyMode: 'quality'` in `VideoEncoder` for better compression (not realtime).
9. Chunk-read large files into MP4Box (4MB at a time) — never load entire file into one ArrayBuffer.

## Architecture Overview

```
FileTreeNode.vue (right-click "Compress…")
  │
  └─► CompressorDialog.vue (settings: codec, bitrate, resolution, output path)
        │
        └─► useCompressor.ts (composable — manages worker lifecycle, progress, cancel)
              │
              └─► compressor.worker.ts (Web Worker)
                    ├─ MP4Box.js  (demux input MP4 chunks)
                    ├─ VideoDecoder / VideoEncoder (WebCodecs)
                    ├─ AudioDecoder / AudioEncoder (WebCodecs)
                    └─ mp4-muxer StreamTarget → FileSystemWritableFileStream
```

## Types to Add (`src/core/types.ts`)

```typescript
export interface CompressSettings {
  codec: 'avc1.640028' | 'vp09.00.10.08' | 'av01.0.04M.08'
  container: 'mp4' | 'webm'
  videoBitrate: number      // bps, e.g. 4_000_000
  audioBitrate: number      // bps, e.g. 128_000
  scaleWidth?: number       // optional output width (maintains aspect ratio)
  scaleHeight?: number
  framerate?: number        // optional fps override
}

export type CompressStatus = 'idle' | 'checking' | 'encoding' | 'done' | 'error' | 'cancelled'

export interface CompressProgress {
  percent: number
  fps: number
  etaSeconds: number
}
```

## Work Plan

### Phase 1 — Infrastructure
- [ ] Install `mp4box` and `mp4-muxer` npm packages
- [ ] Add COOP/COEP headers to `vite.config.ts` server config (needed now for correct cross-origin isolation, future-proofing for wasm)
- [ ] Add `CompressSettings`, `CompressStatus`, `CompressProgress` types to `src/core/types.ts`
- [ ] Create `src/ui/workers/compressor.worker.ts` skeleton

### Phase 2 — Demux & Decode (in worker)
- [ ] Integrate MP4Box.js in worker — chunk-read input `File` via `Blob.slice()` (4MB chunks)
- [ ] Extract video track info (codec string, dimensions, `avcC` description box)
- [ ] Extract audio track info (codec, sampleRate, channels)
- [ ] Feed `EncodedVideoChunk` from MP4Box samples → `VideoDecoder`
- [ ] Feed `EncodedAudioChunk` from MP4Box samples → `AudioDecoder`

### Phase 3 — Encode Pipeline (in worker)
- [ ] Configure `VideoEncoder` (target codec, bitrate, resolution, framerate, `latencyMode: 'quality'`)
- [ ] Implement `FrameSemaphore` for backpressure control (max 5 frames in flight)
- [ ] Implement `VideoFrame.close()` in all paths (try/finally)
- [ ] Configure `AudioEncoder` (AAC/Opus, bitrate, channels, sampleRate)
- [ ] Progress tracking (frame count / total frames, fps, ETA) — postMessage every 30 frames

### Phase 4 — Mux & Write (in worker)
- [ ] Configure `mp4-muxer` `Muxer` with `StreamTarget` pointing to `FileSystemWritableFileStream`
- [ ] Pass `meta` to `addVideoChunk` on every call (keyframe SPS/PPS)
- [ ] Sequence: `encoder.flush()` → `muxer.finalize()` → `writable.close()`
- [ ] Handle errors gracefully → postMessage error to main thread

### Phase 5 — Composable (`useCompressor.ts`)
- [ ] Create `src/ui/composables/useCompressor.ts`
- [ ] Manages: `status`, `progress` (reactive refs), worker lifecycle
- [ ] `compress(file: File, settings: CompressSettings, outputHandle: FileSystemFileHandle): Promise<void>`
- [ ] `cancel()` — `worker.terminate()` + cleanup
- [ ] `checkCodecSupport(codec: string)` — calls `VideoEncoder.isConfigSupported()` before opening dialog

### Phase 6 — UI Components
- [ ] Create `src/ui/components/CompressorDialog.vue`
  - Settings: codec selector (H.264 / VP9), video bitrate slider (500kbps–20Mbps), audio bitrate, resolution preset
  - Progress bar with fps + ETA display
  - Cancel button
  - "Save as…" uses `showSaveFilePicker` before encoding starts
  - Warns if codec not hardware-supported (soft warning, not a blocker)
- [ ] Add right-click context menu to `FileTreeNode.vue` for video files → "Compress…"
  - Use a simple `contextmenu` event + absolute-positioned dropdown (no library)
  - Only show for non-timeline, non-folder nodes

### Phase 7 — Integration & Polish
- [ ] Wire `CompressorDialog` into `App.vue` (v-if modal overlay)
- [ ] After compression done: offer to import the output file into current project
- [ ] E2E test: mock the compressor dialog open via context menu (no actual encoding needed in test)
- [ ] Run `npx vue-tsc --noEmit` — fix all type errors
- [ ] Run `npx playwright test` — all tests pass

## File Map (new files)

| File | Purpose |
|------|---------|
| `src/ui/workers/compressor.worker.ts` | Web Worker — full encode pipeline |
| `src/ui/composables/useCompressor.ts` | Vue composable — worker wrapper |
| `src/ui/components/CompressorDialog.vue` | Modal dialog — settings + progress |

## Files Modified

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `CompressSettings`, `CompressStatus`, `CompressProgress` |
| `src/ui/components/FileTreeNode.vue` | Add context menu with "Compress…" entry |
| `src/ui/App.vue` | Mount `CompressorDialog` |
| `vite.config.ts` | Add COOP/COEP server headers |
| `package.json` | Add `mp4box`, `mp4-muxer` |

## Out of Scope (for this iteration)

- FFmpeg.wasm fallback (future)
- WebM output (future — mp4-muxer already supports it, just not exposed in UI)
- Timeline export/render (separate Render epic)
- H.265/HEVC (patent-encumbered, skip for now)
- Audio-only compression
