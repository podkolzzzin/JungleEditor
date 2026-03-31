# Plan: LUT-Based Color Grading

Full-featured color grading for JungleEditor, delivered in three incremental milestones. Each milestone is independently shippable and verifiable. The approach mirrors DaVinci Resolve's model: per-clip LUT operations stored in the timeline, applied in real-time via the GPU compositor, with a Canvas2D software fallback.

**Core insight:** The current WebGPU fragment shader does `color.rgb * opacity` — LUT sampling slots in between the texture read and the opacity multiply. The bind group is already recreated every frame (because of `importExternalTexture`), so adding a 3D LUT texture is architecturally clean. Operations auto-serialize via js-yaml, and the split logic already propagates non-fade operations to both halves.

---

## Step 1 — Minimum: Basic LUT Apply (`.cube` file → clip)

**Goal:** Import a `.cube` LUT file into the project, assign it to a clip as an operation, and apply it in the WebGPU compositor. Verify visually that the frame colors change.

### 1.1 Parse `.cube` files

Create `src/lut.ts` — a standalone parser for the Adobe/Resolve `.cube` format:
- Parse `TITLE`, `LUT_3D_SIZE`, `DOMAIN_MIN`, `DOMAIN_MAX`, and the RGB float triplets
- Export an interface `LutData { title: string; size: number; data: Float32Array }` where `data` is `size³ × 4` (RGBA, A=1) for direct GPU upload
- The `.cube` format is text-based: lines of `R G B` floats in [0,1] range, row-major order (R varies fastest)
- Handle both 3D LUT (required) and 1D LUT (ignore/skip for now)
- Validate: reject sizes outside 2–128, handle comment lines (`#`), skip blank lines

### 1.2 Extend `TimelineOperation` type

In [src/types.ts](src/types.ts):
- Add `'lut'` to the `type` union: `'cut' | 'remove_segment' | 'speed' | 'fade_in' | 'fade_out' | 'mute' | 'lut'`
- Add optional fields: `lutSourceId?: string` (references a `.source` node for the .cube file), `intensity?: number` (0–1, default 1.0)

### 1.3 Import LUT files into the project

In [src/store.ts](src/store.ts):
- Extend `addVideoFiles()` (or create a parallel `addLutFiles()`) to accept `.cube` files via `showOpenFilePicker` with a new file type filter
- Store the `.cube` file content in the project's `sources/` directory alongside a `.source` metadata file (reuse existing infrastructure — `type: application/x-cube-lut`)
- Cache parsed `LutData` in a `Map<string, LutData>` on the store (keyed by `sourceId`) so the compositor can look them up without re-parsing

### 1.4 Add compositor helper

In [src/components/timeline/compositor.ts](src/components/timeline/compositor.ts):
- Add `getClipLut(clip): { lutSourceId: string; intensity: number } | null` — extracts the first `lut` operation from the clip
- Extend `ActiveClipInfo` with optional `lutSourceId?: string` and `lutIntensity?: number`
- Update `findActiveClip()` to populate these fields

### 1.5 Expand the WebGPU pipeline

In [src/components/timeline/compositor.ts](src/components/timeline/compositor.ts):

**Bind group layout** — add two new bindings:
- `@binding(3)`: `texture_3d<f32>` — the 3D LUT texture
- `@binding(4)`: `sampler` — LUT sampler (linear filtering for interpolation between LUT nodes)

**Params buffer** — extend the `Params` struct:
```
struct Params {
  opacity: f32,
  lutIntensity: f32,  // 0 = bypass, 1 = full LUT
  useLut: f32,        // 0 or 1 flag (no bool in uniform)
}
```
Grow the buffer from 16 to 16 bytes (3 floats + padding, still fits in one vec4).

**WGSL shader** — update the fragment function:
```
// After sampling video texture:
let raw = textureSampleBaseClampToEdge(myTexture, mySampler, in.uv);
var color = raw.rgb;

// LUT application:
if (params.useLut > 0.5) {
  let lutCoord = clamp(color, vec3f(0.0), vec3f(1.0));
  let graded = textureSampleLevel(lutTexture, lutSampler, lutCoord, 0.0).rgb;
  color = mix(color, graded, params.lutIntensity);
}

return vec4f(color * params.opacity, 1.0);
```

**LUT texture management** on `TimelineCompositor`:
- Add `lutTexture: GPUTexture | null`, `lutTextureView: GPUTextureView | null`, `lutSampler: GPUSampler | null`
- Add `uploadLut(lutData: LutData): void` — creates/replaces the 3D texture (`device.createTexture({ size: [size, size, size], format: 'rgba32float', dimension: '3d', usage: TEXTURE_BINDING | COPY_DST })`) and writes data via `device.queue.writeTexture()`
- Add `clearLut(): void` — destroys and nullifies the LUT texture
- When no LUT is active, bind a 1×1×1 identity LUT (passthrough) to avoid shader branching issues, or use the `useLut` flag

**Bind group creation** (in `renderFrame`):
- If `lutTextureView` exists, include it in the bind group; otherwise use the identity fallback texture
- Write `lutIntensity` and `useLut` to the params buffer alongside opacity

### 1.6 Canvas2D fallback

In the `renderCanvas2D` method:
- After `drawImage`, if LUT is active: `getImageData()` → iterate pixels → for each pixel, compute `(r/255, g/255, b/255)` → trilinear lookup in the `LutData.data` Float32Array → mix by intensity → write back → `putImageData()`
- This will be slow but correct. Add a comment noting it's a fallback path.
- Extract the trilinear interpolation into a helper function in `src/lut.ts` (`applyLutToImageData(imageData: ImageData, lut: LutData, intensity: number): void`)

### 1.7 Wire up in `TimelinePlayer.vue`

In [src/components/timeline/TimelinePlayer.vue](src/components/timeline/TimelinePlayer.vue):
- In `renderCurrentFrame()`, after `findActiveClip()`, check if the active clip has a LUT
- If the LUT sourceId changed from the previous frame, call `compositor.uploadLut(store.lutCache.get(sourceId))`
- If no LUT, call `compositor.clearLut()` (or skip if already cleared)
- Pass `lutIntensity` to `renderFrame()`

### 1.8 ClipInspector UI

In [src/components/timeline/ClipInspector.vue](src/components/timeline/ClipInspector.vue):
- Add `<option value="lut">LUT (Color)</option>` in the operation type `<select>`
- In `addOperation()`, set defaults: `op.lutSourceId = ''; op.intensity = 1.0`
- Add template block for `op.type === 'lut'`:
  - Dropdown/selector listing available LUT sources from the project file tree (filter `FileNode` where type matches `.cube`)
  - Intensity slider: `<input type="range" min="0" max="1" step="0.01">` with numeric readout
- Add CSS: `.op-badge.lut { background: #61afef; }` (blue)

### 1.9 ClipBlock indicator

In [src/components/timeline/ClipBlock.vue](src/components/timeline/ClipBlock.vue):
- Add CSS: `.clip-op-dot.lut { background: #61afef; }` — the existing template already renders dots for all operations by class name, so no template change needed

### 1.10 Split behavior

No changes needed in [src/components/timeline/useTimeline.ts](src/components/timeline/useTimeline.ts) — the split logic already copies all operations except `fade_in`/`fade_out` to both halves. LUT operations will naturally propagate.

### Verification (Step 1)

1. **Type-check:** `npx vue-tsc --noEmit` — must pass
2. **E2E tests:** `npx playwright test` — existing tests must still pass
3. **New E2E test:** Add a test in `e2e/editor.spec.ts` that:
   - Creates a project, adds a video, creates a timeline, drags clip
   - Imports a `.cube` file (mock via `enqueueFilePicker` with a tiny 2×2×2 `.cube` text)
   - Opens ClipInspector, adds a LUT operation, selects the LUT source
   - Verifies the LUT dot appears on the ClipBlock
4. **Manual check:** Open a video clip, apply a LUT (e.g., a strong teal-orange .cube file), verify the preview visually changes color. Adjust intensity slider and confirm interpolation.

---

## Step 2 — Advanced: Color Wheels, Scopes & Multi-LUT

**Goal:** Add a dedicated Color panel with lift/gamma/gain wheels (CDL-style), video scopes (waveform, vectorscope), LUT stacking, and before/after comparison.

### 2.1 CDL Color Correction (Lift / Gamma / Gain + Offset)

This is the foundation of every professional color grading tool — three color wheels plus an offset control.

**Type changes** in [src/types.ts](src/types.ts):
- Add `'color_correct'` to `TimelineOperation.type`
- Add optional CDL fields:
  ```
  lift?: { r: number; g: number; b: number }
  gamma?: { r: number; g: number; b: number }
  gain?: { r: number; g: number; b: number }
  offset?: { r: number; g: number; b: number }
  saturation?: number
  ```

**Shader changes** in [src/components/timeline/compositor.ts](src/components/timeline/compositor.ts):
- Add a CDL uniform buffer (or extend the existing params buffer):
  ```
  struct CDL {
    lift: vec3f,    // added to shadows
    gamma: vec3f,   // power curve on midtones
    gain: vec3f,    // multiplier on highlights
    offset: vec3f,  // flat offset
    saturation: f32,
    enabled: f32,
  }
  ```
- Apply in the fragment shader **before** the LUT (this matches DaVinci's node order: CDL → LUT):
  ```
  // CDL formula (ASC standard):
  // out = pow(clamp(gain * (color + offset) + lift, 0, 1), 1/gamma)
  // Then saturation via luminance mix
  ```

### 2.2 Color Wheels UI Component

Create `src/components/timeline/ColorWheels.vue`:
- Three circular wheel controls (Lift, Gamma, Gain) + a horizontal Offset bar
- Each wheel: a color circle where the user drags a point from center to set R/G/B bias, plus a master slider below for intensity
- A saturation slider
- Wire to the clip's `color_correct` operation
- Layout: horizontal row of three wheels, responsive

Implementation approach:
- Render wheels using `<canvas>` (draw HSL color ring + crosshair)
- Mouse drag on the wheel → convert (x, y) offset from center to RGB shift using a standard color wheel mapping
- Display numeric R/G/B values below each wheel
- "Reset" button per wheel and a global reset

### 2.3 Video Scopes

Create `src/components/timeline/VideoScopes.vue`:
- **Waveform** (Y or RGB parade): reads the current frame's pixel data, draws luminance/RGB distribution per column
- **Vectorscope**: plots chrominance (Cb vs Cr) with skin tone line
- **Histogram**: RGB histogram overlay

Implementation:
- Use a second offscreen `<canvas>` to capture the compositor's output via `ctx.drawImage(compositorCanvas, ...)`
- Read with `getImageData()` and compute scope data
- Render scopes on a dedicated `<canvas>` with 2D context
- Update at a throttled rate (e.g., 10 fps) to avoid performance impact during playback
- Toggle between scope types via tabs
- Position: to the right of the preview or as a dockable panel

### 2.4 LUT Stacking (Multiple LUTs per clip)

- Allow multiple `lut` operations on a single clip — they apply in order (first LUT transforms the image, second LUT receives the already-graded image)
- In the shader, this requires either:
  - **Option A:** Multi-pass rendering (render to intermediate texture, re-read, apply next LUT) — more correct but complex
  - **Option B:** Pre-bake the LUT chain into a single combined 3D LUT on the CPU when the operation list changes — more efficient at render time
- **Recommended: Option B** — when the user modifies LUT operations, recompute a combined LUT by sampling LUT1 → LUT2 → ... for each grid point. Cache the result. The compositor always sees a single 3D texture.

### 2.5 Before/After Comparison

In `TimelinePlayer.vue`:
- Add a split-screen mode: left half shows original, right half shows graded
- Implement as two render passes to two viewports in the same canvas
- Toggle via a button on the player controls
- Optional: wipe handle (draggable vertical divider)

### 2.6 Color Panel Integration

In [src/components/timeline/TimelineEditor.vue](src/components/timeline/TimelineEditor.vue):
- Add a "Color" tab alongside the existing inspector
- When active, show `ColorWheels.vue` + `VideoScopes.vue` in the right panel
- The CDL values bind to the selected clip's `color_correct` operation (auto-created if missing)

### Verification (Step 2)

1. **Type-check + E2E** as always
2. **New E2E tests:**
   - Add a `color_correct` operation, verify CDL badge dot appears
   - Toggle before/after comparison mode
3. **Manual checks:**
   - Adjust lift/gamma/gain wheels, verify live preview updates
   - Open scopes, verify waveform/vectorscope respond to image content
   - Stack two LUTs on one clip, verify combined result
   - Split a clip with CDL + LUT, verify both halves retain operations

---

## Step 3 — Pro: Node-Based Grading, Qualifiers & Power Windows

**Goal:** DaVinci-class grading pipeline with node graph, secondary corrections (qualifiers), and shaped masks (power windows).

### 3.1 Node-Based Color Pipeline

Replace the linear operations list with a **node graph** per clip — each node contains its own CDL + LUT + qualifier + window.

**Data model** in [src/types.ts](src/types.ts):
- Add `TimelineColorNode` interface:
  ```
  id: string
  label: string
  type: 'serial' | 'parallel' | 'layer'
  cdl?: { lift, gamma, gain, offset, saturation }
  lut?: { lutSourceId, intensity }
  qualifier?: QualifierConfig
  window?: PowerWindowConfig
  enabled: boolean
  ```
- Add `colorNodes?: TimelineColorNode[]` to `TimelineClip` (or replace `operations` filtering for color ops)
- Node connections: for the serial case (most common), nodes process in array order. For parallel, blend results. For layer, composite with alpha.

### 3.2 Node Graph UI

Create `src/components/timeline/NodeGraph.vue`:
- Visual node editor: boxes connected by wires, draggable
- Render using `<canvas>` or SVG
- Supports serial chain (default), parallel branches, layer nodes
- Each node: click to select → shows its CDL/LUT/qualifier/window in the color panel
- Right-click context menu: add node before/after, delete, enable/disable, change type
- Drag to reorder serial nodes

### 3.3 Qualifiers (Secondary Color Correction)

Isolate a color range for targeted correction — the "HSL qualifier" from DaVinci.

**Data model:**
```
QualifierConfig {
  hueCenter: number      // 0–360
  hueWidth: number       // half-width in degrees
  satLow: number         // 0–1
  satHigh: number        // 0–1
  lumLow: number         // 0–1
  lumHigh: number        // 0–1
  softness: number       // edge feathering 0–1
}
```

**Shader:**
- Convert pixel RGB → HSL
- Compute a qualifier matte (0 or 1, with soft edges) based on whether the pixel falls within the H/S/L ranges
- Apply the node's CDL correction only where matte > 0: `mixedColor = mix(originalColor, gradedColor, matte * softness)`

**UI:**
- HSL qualifier controls: hue ring picker (center + width), sat/lum range sliders
- "Highlight" toggle: when enabled, shows the matte as a B&W overlay (or highlight out-of-range in monochrome) so the user can see what's selected
- Eyedropper tool: click on the preview to pick a starting hue/sat/lum

### 3.4 Power Windows (Shaped Masks)

Geometric masks that limit corrections to a region of the frame.

**Data model:**
```
PowerWindowConfig {
  type: 'circle' | 'rectangle' | 'polygon' | 'gradient'
  // For circle: center (x,y normalized 0–1), radiusX, radiusY, rotation, softness
  // For rectangle: center, width, height, rotation, softness
  // For polygon: points array, softness
  // For gradient: angle, position, width
  invert: boolean
}
```

**Shader:**
- Compute a window matte per pixel based on the shape geometry
- Apply softness via smoothstep
- Multiply with qualifier matte (if present) for combined masking
- The CDL/LUT correction applies only within the final matte

**UI:**
- Shape tools in the preview overlay: click-drag to create circles/rectangles
- On-screen handles for position, size, rotation, softness
- Polygon mode: click to add points, double-click to close
- Invert toggle

### 3.5 Keyframing

Animate any color parameter over time within a clip.

**Data model:**
```
Keyframe { time: number; value: number }
KeyframeTrack { parameter: string; keyframes: Keyframe[]; interpolation: 'linear' | 'smooth' }
```

Add `keyframes?: KeyframeTrack[]` to `TimelineColorNode`.

**UI:**
- Keyframe timeline strip below the color panel
- Diamond markers at keyframe positions
- Click parameter label to toggle keyframe mode
- Add/remove keyframes at current playhead position
- Interpolation between keyframes: linear or cubic (Catmull-Rom)

**Compositor:**
- Before rendering each frame, evaluate all keyframe tracks at the current clip-local time
- Interpolate CDL values, LUT intensity, qualifier ranges, window positions
- Pass interpolated values to the shader

### 3.6 Optimized Multi-Node Rendering

For the node graph with qualifiers and windows, the single-pass shader becomes insufficient:

**Approach: Multi-pass with render-to-texture:**
1. Render the video frame to an intermediate texture (Texture A)
2. For each color node in order:
   - Bind the input texture + node's LUT + CDL uniforms + qualifier/window params
   - Render to the output texture (Texture B)
   - Swap A ↔ B for the next node
3. Final pass: render the last output to the canvas with opacity

**WebGPU implementation:**
- Create two `rgba16float` textures (ping-pong) at canvas resolution
- Each node gets its own render pass with the appropriate bind group
- The first pass reads from `texture_external` (video), subsequent passes read from intermediate `texture_2d`
- Need a second pipeline variant that reads `texture_2d` instead of `texture_external`

### 3.7 LUT Generation / Export

Allow the user to bake the current node chain into a new `.cube` file:
- Sample the full pipeline at a grid of input colors (e.g., 33³)
- Write out the standard `.cube` format
- Save to the project's file tree

### Verification (Step 3)

1. **Type-check + E2E** as always
2. **New E2E tests:**
   - Create a node graph with two serial nodes, verify they render
   - Add a qualifier, verify matte highlight toggle
   - Add a power window, verify shape appears on preview
3. **Manual checks:**
   - Create a 3-node serial chain: CDL → LUT → CDL with qualifier
   - Apply a circular power window, verify only the interior is affected
   - Keyframe the window position, play back, verify animation
   - Export grading as a `.cube` file, re-import, verify result matches
4. **Performance:**
   - Multi-node rendering at 1080p should maintain 24+ fps
   - Profile with Chrome DevTools GPU timeline
   - If needed, reduce intermediate texture resolution or add a "preview quality" mode

---

## Summary Table

| Feature | Step 1 (Min) | Step 2 (Adv) | Step 3 (Pro) |
|---------|:---:|:---:|:---:|
| `.cube` LUT parsing | ✓ | | |
| LUT as clip operation | ✓ | | |
| WebGPU 3D LUT shader | ✓ | | |
| Canvas2D LUT fallback | ✓ | | |
| LUT intensity slider | ✓ | | |
| ClipInspector + ClipBlock UI | ✓ | | |
| CDL (Lift/Gamma/Gain) | | ✓ | |
| Color Wheels UI | | ✓ | |
| Video Scopes | | ✓ | |
| LUT stacking / baking | | ✓ | |
| Before/After comparison | | ✓ | |
| Node-based pipeline | | | ✓ |
| HSL Qualifiers | | | ✓ |
| Power Windows | | | ✓ |
| Keyframing | | | ✓ |
| Multi-pass GPU rendering | | | ✓ |
| LUT export | | | ✓ |

## Files Changed per Step

**Step 1:**
| File | Action |
|------|--------|
| `src/lut.ts` | **New** — `.cube` parser + Canvas2D LUT applicator |
| `src/types.ts` | Edit — add `'lut'` to operation type, add fields |
| `src/store.ts` | Edit — add LUT file import + cache |
| `src/components/timeline/compositor.ts` | Edit — 3D LUT texture, expanded shader, bind group, Canvas2D path |
| `src/components/timeline/TimelinePlayer.vue` | Edit — LUT upload/clear per frame |
| `src/components/timeline/ClipInspector.vue` | Edit — LUT operation UI |
| `src/components/timeline/ClipBlock.vue` | Edit — `.lut` dot color CSS |
| `e2e/editor.spec.ts` | Edit — new LUT test |

**Step 2:**
| File | Action |
|------|--------|
| `src/types.ts` | Edit — add `'color_correct'` type + CDL fields |
| `src/components/timeline/ColorWheels.vue` | **New** — wheel controls |
| `src/components/timeline/VideoScopes.vue` | **New** — waveform/vectorscope/histogram |
| `src/components/timeline/compositor.ts` | Edit — CDL uniforms + shader, LUT baking |
| `src/components/timeline/TimelineEditor.vue` | Edit — Color tab integration |
| `src/components/timeline/ClipInspector.vue` | Edit — CDL operation option |
| `src/components/timeline/ClipBlock.vue` | Edit — CDL dot color CSS |

**Step 3:**
| File | Action |
|------|--------|
| `src/types.ts` | Edit — `TimelineColorNode`, qualifier, window, keyframe types |
| `src/components/timeline/NodeGraph.vue` | **New** — node graph editor |
| `src/components/timeline/QualifierPanel.vue` | **New** — HSL qualifier controls |
| `src/components/timeline/PowerWindow.vue` | **New** — shape tools + overlay |
| `src/components/timeline/KeyframeEditor.vue` | **New** — keyframe timeline strip |
| `src/components/timeline/compositor.ts` | Edit — multi-pass rendering, qualifier/window shader |
| `src/components/timeline/TimelinePlayer.vue` | Edit — keyframe evaluation, overlay rendering |
| `src/lut.ts` | Edit — LUT export / generation |

## Decisions

- **LUT storage:** Reuse existing `.source` file infrastructure with `type: application/x-cube-lut` rather than creating a new file system — minimizes store.ts changes in Step 1
- **3D LUT texture format:** `rgba32float` for precision; size capped at 128³ (8MB per LUT) which is within WebGPU limits
- **CDL before LUT:** Matches DaVinci Resolve's default node order (primaries → LUT) and the ASC CDL standard
- **LUT stacking via CPU baking (Step 2):** More efficient than multi-pass GPU for the simple two-LUT case; multi-pass GPU reserved for Step 3's full node pipeline
- **Canvas2D LUT:** Software fallback is important for non-WebGPU browsers but will be slow — acceptable since Canvas2D is already the degraded path
- **No new npm dependencies:** `.cube` parsing is trivial (~50 lines). Color wheels and scopes use native Canvas2D. Keeps the bundle lean.
