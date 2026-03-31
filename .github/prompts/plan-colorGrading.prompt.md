# Plan: Color Grading — WebGPU-First

Full-featured color grading for JungleEditor, delivered in three incremental milestones.
Every step is independently verifiable. WebGPU is the primary render path from day one.

> **Architecture:** Follows the Core / UI separation. Pure data types and helpers go in
> `src/core/`, WebGPU/Vue code stays in `src/ui/`.
>
> **Parallel work note:** This plan is designed to be implemented in parallel with
> `plan-rendering.prompt.md`. See §Parallel Integration Contract at the bottom.

**Core architecture:** The fragment shader currently does `color.rgb * opacity`. We expand
the `Params` uniform buffer with color-grading floats and chain GPU math operations in
the shader: sample → RGB gains → brightness → contrast → saturation → (LUT) → opacity.
The bind group is already recreated every frame, so adding new uniforms/textures is clean.

---

## Step 1 — Minimum: Color Controls + Built-in Profiles

**Goal:** Per-clip color adjustments via sliders (brightness, contrast, saturation, R/G/B,
exposure, temperature, tint) applied in real-time on the GPU. Plus 5–10 built-in presets
the user can apply with one click.

### 1.1 Extend `TimelineOperation` type

In [src/core/types.ts](src/core/types.ts):
- Add `'color_grade'` to the `type` union
- Add optional fields to `TimelineOperation`:
  ```
  brightness?: number   // -1 to +1, default 0
  contrast?: number     // 0 to 3, default 1
  saturation?: number   // 0 to 3, default 1
  exposure?: number     // -3 to +3 stops, default 0
  temperature?: number  // -1 (cool) to +1 (warm), default 0
  tint?: number         // -1 (green) to +1 (magenta), default 0
  rGain?: number        // 0 to 2, default 1
  gGain?: number        // 0 to 2, default 1
  bGain?: number        // 0 to 2, default 1
  profileName?: string  // name of a built-in preset (optional)
  ```

### 1.2 Built-in color profiles

Create `src/core/color/color-profiles.ts` — pure data, no browser/Vue deps:
- Export a `ColorGradeParams` interface (the numeric fields above, all required, with defaults)
- Export a `DEFAULT_COLOR_GRADE: ColorGradeParams` constant (all neutral values)
- Export a `COLOR_PROFILES: Record<string, ColorGradeParams>` map with 8–10 presets:
- Create `src/core/color/index.ts` — barrel re-export of all color module exports

| Profile | Character |
|---------|-----------|
| **Cinematic Warm** | Slight warm temperature, lowered shadows, boosted contrast |
| **Teal & Orange** | Cool shadows (teal), warm highlights (orange) via temp+tint+RGB |
| **Bleach Bypass** | High contrast, desaturated, lifted blacks |
| **Film Noir** | Very low saturation, high contrast, crushed blacks |
| **Vintage Film** | Warm tint, faded blacks (lifted brightness), slight desaturation |
| **Cool Moonlight** | Blue-shifted temperature, lower saturation, slightly dark |
| **Golden Hour** | Strong warm temperature, boosted exposure, soft contrast |
| **Muted Pastel** | Low contrast, slightly desaturated, lifted shadows |
| **High Contrast B&W** | Saturation = 0, high contrast, brightness bump |
| **Cyberpunk** | Teal+magenta tint, high saturation, strong contrast |

Each profile is just a `ColorGradeParams` object — pure data, no logic.

### 1.3 Compositor helper functions

Create `src/core/color/clip-color.ts` (pure function, no GPU dependency):
- Add `getClipColorGrade(clip: TimelineClip): ColorGradeParams` — reads the first
  `color_grade` operation from `clip.operations`, resolves `profileName` into values,
  merges with `DEFAULT_COLOR_GRADE`, returns the result
- Re-export from `src/core/color/index.ts`

In [src/core/timeline/clip-helpers.ts](src/core/timeline/clip-helpers.ts):
- Extend `ActiveClipInfo` with optional `colorGrade?: ColorGradeParams`
- Update `findActiveClip()` to call `getClipColorGrade()` and populate the field
  (the field is optional so that rendering code compiles without color grading)

### 1.4 Expand WebGPU shader & uniform buffer

In [src/ui/components/timeline/compositor.ts](src/ui/components/timeline/compositor.ts):

**Params buffer — grow from 16 bytes to 48 bytes (12 floats):**
```wgsl
struct Params {
  opacity: f32,
  brightness: f32,
  contrast: f32,
  saturation: f32,    // 16 bytes — vec4 aligned
  exposure: f32,
  temperature: f32,
  tint: f32,
  _pad1: f32,         // 32 bytes
  rGain: f32,
  gGain: f32,
  bGain: f32,
  _pad2: f32,         // 48 bytes
}
```

Update `paramsBuffer` creation: `size: 48`.
Update `device.queue.writeBuffer(...)` in `renderWebGPU` to write all 12 floats.

**WGSL fragment shader — full color pipeline:**
```wgsl
@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  var c = textureSampleBaseClampToEdge(myTexture, mySampler, in.uv).rgb;

  // 1. Exposure (EV stops)
  c *= pow(2.0, params.exposure);

  // 2. Temperature & tint (simplified: shift blue↔yellow, green↔magenta)
  c.r += params.temperature * 0.1;
  c.b -= params.temperature * 0.1;
  c.g += params.tint * 0.1;
  c.r -= params.tint * 0.05;
  c.b -= params.tint * 0.05;

  // 3. RGB channel gains
  c = vec3f(c.r * params.rGain, c.g * params.gGain, c.b * params.bGain);

  // 4. Brightness (additive)
  c += vec3f(params.brightness);

  // 5. Contrast (pivot at 0.5)
  c = (c - vec3f(0.5)) * params.contrast + vec3f(0.5);

  // 6. Saturation (luminance-preserving)
  let lum = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(vec3f(lum), c, params.saturation);

  // 7. Clamp & opacity
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  return vec4f(c * params.opacity, 1.0);
}
```

**Bind group layout** — unchanged (3 bindings), only `paramsBuffer` size changes.

### 1.5 Update `renderFrame()` signature

In [src/ui/components/timeline/compositor.ts](src/ui/components/timeline/compositor.ts):
- Change `renderFrame(video, opacity)` → `renderFrame(video: HTMLVideoElement, opacity: number, cg: ColorGradeParams): boolean`
- In `renderWebGPU`, write the full float array:
  `new Float32Array([opacity, cg.brightness, cg.contrast, cg.saturation, cg.exposure, cg.temperature, cg.tint, 0, cg.rGain, cg.gGain, cg.bGain, 0])`
- In `renderCanvas2D`, apply a basic approximation via CSS canvas filters
  (`ctx2d.filter = 'brightness(...) contrast(...) saturate(...)'`) or skip for now
  with a TODO comment — Canvas2D is the degraded path anyway

### 1.6 Wire up in `TimelinePlayer.vue`

In [src/ui/components/timeline/TimelinePlayer.vue](src/ui/components/timeline/TimelinePlayer.vue):
- In `renderCurrentFrame()`, after `findActiveClip()`, read `info.colorGrade`
- Pass to compositor: `compositor.renderFrame(video, info.opacity, info.colorGrade)`
- When no clip is active, pass `DEFAULT_COLOR_GRADE`

### 1.7 ClipInspector — color grading UI

In [src/ui/components/timeline/ClipInspector.vue](src/ui/components/timeline/ClipInspector.vue):

**Add operation option:**
- `<option value="color_grade">Color Grade</option>` in the `<select>`
- In `addOperation()`: set defaults to neutral values (all 0/1 per field)

**Color grading template block** (shown when `op.type === 'color_grade'`):

A vertical stack of labeled sliders:

| Control | Range | Step | Default | Label |
|---------|-------|------|---------|-------|
| Exposure | -3 to +3 | 0.05 | 0 | Exposure (EV) |
| Temperature | -1 to +1 | 0.01 | 0 | Temp |
| Tint | -1 to +1 | 0.01 | 0 | Tint |
| Brightness | -1 to +1 | 0.01 | 0 | Brightness |
| Contrast | 0 to 3 | 0.01 | 1 | Contrast |
| Saturation | 0 to 3 | 0.01 | 1 | Saturation |
| R Gain | 0 to 2 | 0.01 | 1 | Red |
| G Gain | 0 to 2 | 0.01 | 1 | Green |
| B Gain | 0 to 2 | 0.01 | 1 | Blue |

Each slider: `<input type="range">` + `<input type="number">` side by side, with
two-way binding to the operation field, calling `markDirty()` on every `@input`.

**Profile selector:**
- A `<select>` dropdown at the top of the color grade block: `<option>` per profile name + "Custom"
- When selected, overwrite all fields with the profile's values (but keep profileName stored)
- When any slider is manually changed after applying a profile, switch display to "Custom"
- A "Reset" button that restores all values to defaults

**CSS:**
- `.op-badge.color_grade { background: #61afef; }` (blue)
- Slider styling: compact, dark theme consistent with existing inputs
- Slider "active region" highlight (colored thumb at non-default positions)

### 1.8 ClipBlock indicator

In [src/ui/components/timeline/ClipBlock.vue](src/ui/components/timeline/ClipBlock.vue):
- Add CSS: `.clip-op-dot.color_grade { background: #61afef; }`
- No template changes needed — the existing `v-for` renders dots by class name

### 1.9 Split behavior

No changes needed in [src/ui/components/timeline/useTimeline.ts](src/ui/components/timeline/useTimeline.ts) —
the split logic copies all operations except `fade_in`/`fade_out` to both halves.
`color_grade` will naturally propagate to both clips.

### 1.10 Persistence

No changes needed in [src/ui/project.ts](src/ui/project.ts) — `js-yaml` auto-serializes all
fields on `TimelineOperation`. New numeric fields survive YAML round-trips without any
parser changes.

### Verification (Step 1)

1. `npx vue-tsc --noEmit` — must pass
2. `npx playwright test` — all existing tests must pass
3. **New E2E test** in `e2e/editor.spec.ts`:
   - Create project → add video → create timeline → drag clip
   - Open ClipInspector, add `color_grade` operation
   - Verify the color_grade dot appears on the clip block
   - Select a built-in profile from the dropdown, verify sliders update
   - Manually adjust brightness slider, verify it changes
4. **Manual verification:**
   - Apply "Teal & Orange" profile → preview should show visible color shift
   - Drag brightness slider → live preview update per frame
   - Split clip → both halves retain color grading
   - Save & reopen → grading persists in YAML

---

## Step 2 — Advanced: LUT Files + Scopes + Before/After

**Goal:** Import `.cube` LUT files, apply via 3D texture lookup in WebGPU, add video scopes
for monitoring, and before/after split comparison.

### 2.1 Parse `.cube` files

Create `src/core/color/lut.ts` (pure parser, no browser/Vue deps):
- Export `LutData { title: string; size: number; data: Float32Array }` (`size³ × 4` RGBA)
- Parse the Adobe `.cube` format: header lines (`TITLE`, `LUT_3D_SIZE`, `DOMAIN_MIN/MAX`),
  then `R G B` float triplets, one per line. Handle comments (`#`), blank lines.
- Validate size 2–128, reject 1D LUTs (or ignore 1D section)
- Export `parseCubeFile(text: string): LutData`

### 2.2 Extend `TimelineOperation` for LUT

In [src/core/types.ts](src/core/types.ts):
- Add `'lut'` to the `type` union
- Add fields: `lutSourceId?: string`, `lutIntensity?: number` (0–1, default 1)

### 2.3 Import LUT files into the project

In [src/ui/store.ts](src/ui/store.ts):
- Add `addLutFiles()` (parallel to `addVideoFiles()`) — opens file picker for `.cube` files,
  copies content into `sources/` with a `.source` metadata file (`type: application/x-cube-lut`),
  adds to file tree
- Add `lutCache: Map<string, LutData>` — parsed LUT data keyed by sourceId
- Parse on import and cache; lazy-parse on project load if referenced by a timeline

### 2.4 Expand WebGPU pipeline for 3D LUT

In [src/ui/components/timeline/compositor.ts](src/ui/components/timeline/compositor.ts):

**New bind group layout (expand to 5 bindings):**
- `@binding(3)`: `texture_3d<f32>` — 3D LUT texture
- `@binding(4)`: `sampler` — LUT sampler (linear filtering for trilinear interpolation)

**New members on `TimelineCompositor`:**
- `lutTexture: GPUTexture | null`, `lutTextureView: GPUTextureView | null`
- `lutSampler: GPUSampler | null`
- `identityLutTexture` + view — a 1×1×1 passthrough texture for when no LUT is active
- `uploadLut(lutData: LutData): void` — creates `rgba32float` 3D texture, writes data
- `clearLut(): void` — destroys active LUT texture

**Expand Params struct to 64 bytes:**
```wgsl
struct Params {
  opacity: f32,
  brightness: f32,
  contrast: f32,
  saturation: f32,    // 16
  exposure: f32,
  temperature: f32,
  tint: f32,
  lutIntensity: f32,  // 32
  rGain: f32,
  gGain: f32,
  bGain: f32,
  useLut: f32,        // 48 (0 or 1 flag)
}
```

**Shader — add LUT sampling after saturation, before clamp:**
```wgsl
// After saturation...
if (params.useLut > 0.5) {
  let lutCoord = clamp(c, vec3f(0.0), vec3f(1.0));
  let graded = textureSampleLevel(lutTexture, lutSampler, lutCoord, 0.0).rgb;
  c = mix(c, graded, params.lutIntensity);
}
c = clamp(c, vec3f(0.0), vec3f(1.0));
```

**Pipeline change:** Need to recreate the pipeline with the new bind group layout (5 bindings).
The bind group is already per-frame, so LUT texture inclusion is straightforward.

### 2.5 Update `renderFrame()` and `TimelinePlayer`

- `renderFrame` signature: add `lutSourceId?: string`, `lutIntensity?: number`
- TimelinePlayer: before each render call, check if the active clip has a `lut` operation.
  If the LUT sourceId changed, call `compositor.uploadLut(store.lutCache.get(id))`.
  If no LUT, ensure the identity texture is bound.

### 2.6 ClipInspector — LUT UI

- Add `<option value="lut">LUT</option>` in the operation select
- Template for `op.type === 'lut'`:
  - `<select>` listing available `.cube` sources from the file tree (filter by mimeType)
  - Intensity slider: 0–1, step 0.01
- A clip can have both `color_grade` and `lut` — the shader pipeline order is:
  exposure → temperature → tint → RGB → brightness → contrast → saturation → LUT → opacity

### 2.7 Video scopes

Create `src/ui/components/timeline/VideoScopes.vue`:
- Reads the compositor canvas output via `drawImage()` onto an offscreen canvas, then
  `getImageData()` to analyze pixels
- Three scope modes (tabs): **Waveform** (RGB parade), **Vectorscope**, **Histogram**
- Renders onto a dedicated `<canvas>` with 2D context
- Update rate: throttled to ~10 fps to avoid perf impact during playback
- Positioned below the preview or as a toggleable overlay panel

### 2.8 Before/After comparison

In `TimelinePlayer.vue`:
- Add a split-screen toggle button on the player toolbar
- When active: render two passes — left viewport with grading, right viewport without
  (pass `DEFAULT_COLOR_GRADE` for the "before" side)
- Draggable vertical divider for wipe position

### Verification (Step 2)

1. `npx vue-tsc --noEmit` + `npx playwright test`
2. **New E2E tests:**
   - Import a `.cube` file, add LUT operation to clip, verify dot appears
   - Toggle before/after, verify the split is visible
3. **Manual checks:**
   - Apply a strong LUT (e.g., a teal-orange .cube), verify preview changes
   - Adjust LUT intensity slider, verify blend
   - Combine color_grade + LUT on same clip, verify correct pipeline order
   - Open scopes, verify waveform responds to grading changes
   - Split clip with LUT, verify both halves retain it

---

## Step 3 — Pro: CDL Wheels, Node Pipeline, Qualifiers & Power Windows

**Goal:** DaVinci-class grading with Lift/Gamma/Gain color wheels, node-based pipeline,
HSL qualifiers for secondary corrections, power windows for regional masking, and keyframing.

### 3.1 CDL (Lift / Gamma / Gain) color wheels

**Type changes** in [src/core/types.ts](src/core/types.ts):
- Extend `color_grade` operation (or add `'cdl'` type) with:
  ```
  lift?: { r: number; g: number; b: number }
  gamma?: { r: number; g: number; b: number }
  gain?: { r: number; g: number; b: number }
  offset?: { r: number; g: number; b: number }
  ```
- These follow the ASC CDL formula: `out = pow(clamp(gain * (color + offset) + lift, 0, 1), 1/gamma)`

**Shader changes:** Add CDL uniform buffer (48 bytes: 4 × vec3f + padding). Apply CDL
_before_ the basic brightness/contrast/saturation chain (matching DaVinci's primary → secondary order).

**UI:** Create `src/ui/components/timeline/ColorWheels.vue`:
- Three circular wheel controls (Lift, Gamma, Gain) rendered on `<canvas>`
- Color ring with a draggable center point → maps (x, y) to RGB channel bias
- Master slider below each wheel
- Offset as a horizontal bar/slider
- Wire to the clip's CDL fields, `markDirty()` on drag

### 3.2 Node-based color pipeline

Replace the single-operation model with a **node graph** per clip.

**Data model** in [src/core/types.ts](src/core/types.ts):
- `TimelineColorNode { id, label, type: 'serial'|'parallel'|'layer', cdl?, basicGrade?, lut?, qualifier?, window?, enabled }`
- Add `colorNodes?: TimelineColorNode[]` to `TimelineClip`

**Compositor:** Multi-pass rendering with ping-pong textures:
- Two `rgba16float` intermediate textures at canvas resolution
- Each node: bind input texture + node's uniforms → render to output texture → swap
- First pass reads `texture_external` (video), subsequent read `texture_2d`
- Requires a second pipeline variant for `texture_2d` input

**UI:** Create `src/ui/components/timeline/NodeGraph.vue`:
- Visual boxes connected by wires (SVG or canvas)
- Click node → shows its grade controls in the panel
- Right-click: add/remove/reorder nodes

### 3.3 HSL Qualifiers (secondary corrections)

Isolate a color range for targeted grading.

**Data model:**
```
QualifierConfig { hueCenter, hueWidth, satLow, satHigh, lumLow, lumHigh, softness }
```

**Shader:** Convert RGB → HSL, compute qualifier matte (0–1 with soft edges), apply node's
correction only where matte > 0 via `mix(original, graded, matte)`.

**UI:** Create `src/ui/components/timeline/QualifierPanel.vue`:
- Hue ring picker (center + width arc), sat/lum range sliders
- "Highlight" toggle shows matte as B&W overlay
- Eyedropper: click preview to pick starting H/S/L

### 3.4 Power Windows (shaped masks)

**Data model:**
```
PowerWindowConfig { type: 'circle'|'rectangle'|'polygon'|'gradient', center, size, rotation, softness, invert }
```

**Shader:** Compute window matte per pixel (smoothstep for softness), multiply with qualifier
matte. Grade applies only within the combined mask.

**UI:** Create `src/ui/components/timeline/PowerWindow.vue`:
- Shape tools as overlay on the preview canvas
- On-screen drag handles for position, size, rotation, softness
- Invert toggle

### 3.5 Keyframing

**Data model:** `Keyframe { time, value }`, `KeyframeTrack { parameter, keyframes[], interpolation }`
on each `TimelineColorNode`.

**Compositor:** Evaluate keyframe tracks at clip-local time each frame, interpolate values
(linear or Catmull-Rom), pass to shader.

**UI:** `src/ui/components/timeline/KeyframeEditor.vue` — diamond markers on a timeline strip,
click to add/remove at playhead.

### 3.6 LUT generation / export

Bake the full node chain into a `.cube` file:
- Sample the pipeline at 33³ grid points
- Write standard `.cube` format
- Save to the project's file tree via `src/core/color/lut.ts` `exportCubeFile()`

### Verification (Step 3)

1. `npx vue-tsc --noEmit` + `npx playwright test`
2. **New E2E:** Create node graph with 2 serial nodes, verify correct rendering
3. **Manual:** CDL wheels adjust live; qualifier isolates a hue; power window masks a region;
   keyframe a parameter and play back; export as .cube and re-import

---

## Summary Table

| Feature | Step 1 (Min) | Step 2 (Adv) | Step 3 (Pro) |
|---------|:---:|:---:|:---:|
| Brightness / Contrast / Saturation | ✓ | | |
| Exposure / Temperature / Tint | ✓ | | |
| RGB channel gains | ✓ | | |
| 8–10 built-in color profiles | ✓ | | |
| Profile selector in inspector | ✓ | | |
| WebGPU shader color pipeline | ✓ | | |
| `.cube` LUT parsing | | ✓ | |
| LUT as clip operation (3D texture) | | ✓ | |
| LUT intensity slider | | ✓ | |
| Video scopes (waveform/vector/histo) | | ✓ | |
| Before/After comparison | | ✓ | |
| CDL Lift/Gamma/Gain wheels | | | ✓ |
| Node-based pipeline | | | ✓ |
| HSL Qualifiers | | | ✓ |
| Power Windows | | | ✓ |
| Keyframing | | | ✓ |
| Multi-pass GPU rendering | | | ✓ |
| LUT export | | | ✓ |

## Files Changed per Step

**Step 1 (9 files, 2 new):**

| File | Action |
|------|--------|
| `src/core/color/color-profiles.ts` | **New** — `ColorGradeParams` interface, `DEFAULT_COLOR_GRADE`, `COLOR_PROFILES` map |
| `src/core/color/clip-color.ts` | **New** — `getClipColorGrade()` helper (pure function) |
| `src/core/color/index.ts` | **New** — barrel re-export |
| `src/core/types.ts` | Edit — add `'color_grade'` to `TimelineOperation.type`, add 9 optional numeric fields + `profileName` |
| `src/core/timeline/clip-helpers.ts` | Edit — extend `ActiveClipInfo` with optional `colorGrade?: ColorGradeParams`, update `findActiveClip()` |
| `src/ui/components/timeline/compositor.ts` | Edit — expand `Params` struct to 48 bytes (12 floats), rewrite WGSL fragment shader with full color pipeline, update `renderFrame()` signature |
| `src/ui/components/timeline/TimelinePlayer.vue` | Edit — extract `colorGrade` from `ActiveClipInfo`, pass to `compositor.renderFrame()` |
| `src/ui/components/timeline/ClipInspector.vue` | Edit — add `color_grade` option, profile `<select>`, 9 sliders, reset button |
| `src/ui/components/timeline/ClipBlock.vue` | Edit — `.clip-op-dot.color_grade` CSS |
| `src/ui/components/timeline/useTimeline.ts` | No changes needed (split already copies non-fade ops) |
| `e2e/editor.spec.ts` | Edit — new test for color_grade operation |

**Step 2 (7 files, 2 new):**

| File | Action |
|------|--------|
| `src/core/color/lut.ts` | **New** — `.cube` parser, `LutData` type (re-exported from `src/core/color/index.ts`) |
| `src/ui/components/timeline/VideoScopes.vue` | **New** — waveform/vectorscope/histogram |
| `src/core/types.ts` | Edit — add `'lut'` type + `lutSourceId`, `lutIntensity` fields |
| `src/ui/store.ts` | Edit — `addLutFiles()`, `lutCache` map |
| `src/ui/components/timeline/compositor.ts` | Edit — 3D LUT texture, 5-binding layout, LUT shader sampling, `uploadLut()`/`clearLut()` |
| `src/ui/components/timeline/TimelinePlayer.vue` | Edit — LUT upload per frame, scopes integration |
| `src/ui/components/timeline/ClipInspector.vue` | Edit — LUT operation UI (source picker + intensity) |

**Step 3 (6 new files, 3 edits):**

| File | Action |
|------|--------|
| `src/ui/components/timeline/ColorWheels.vue` | **New** — CDL wheel controls |
| `src/ui/components/timeline/NodeGraph.vue` | **New** — node graph editor |
| `src/ui/components/timeline/QualifierPanel.vue` | **New** — HSL qualifier controls |
| `src/ui/components/timeline/PowerWindow.vue` | **New** — shape tools + overlay |
| `src/ui/components/timeline/KeyframeEditor.vue` | **New** — keyframe strip |
| `src/core/color/lut.ts` | Edit — add `exportCubeFile()` |
| `src/core/types.ts` | Edit — `TimelineColorNode`, `QualifierConfig`, `PowerWindowConfig`, keyframe types |
| `src/ui/components/timeline/compositor.ts` | Edit — multi-pass ping-pong rendering, qualifier/window shader code |
| `src/ui/components/timeline/TimelineEditor.vue` | Edit — Color tab, node graph panel integration |

## Parallel Integration Contract (with Rendering Plan)

> This section defines how the color grading and rendering plans interact so they can
> be implemented simultaneously without conflicts.

### How Color Grading Automatically Works with Rendering

1. **Fingerprinting**: The rendering plan's fingerprint includes the full `clip.operations`
   array. When a `color_grade` or `lut` operation is added/modified, the fingerprint
   changes and affected segments are re-rendered. **No rendering code changes needed.**

2. **`ActiveClipInfo.colorGrade` is optional**: The `colorGrade` field on `ActiveClipInfo`
   is typed as `colorGrade?: ColorGradeParams`. This means:
   - **If rendering lands first**: It compiles fine — `colorGrade` is undefined, the render
     worker's `FrameRenderer` skips color operations.
   - **If color grading lands first**: `ActiveClipInfo` has the field, rendering adopts it
     automatically when merged.

3. **Compositor vs. FrameRenderer**: Color grading modifies the live preview compositor
   (`src/ui/components/timeline/compositor.ts`). Rendering uses a **separate**
   `FrameRenderer` class (`src/ui/render/frame-renderer.ts`). No merge conflicts on this file.

4. **Future WebGPU render worker**: To share the color grading WGSL shader with the render
   worker, extract the shader string to `src/ui/components/timeline/shader.ts` (or export
   it from `compositor.ts`). The `WebGPUFrameRenderer` in the render worker imports it.

### Shared Files — Ownership Rules

| File | Rendering owns | Color Grading owns | Contract |
|------|---------------|-------------------|----------|
| `src/core/types.ts` | `RenderProfile`, `RenderDocument`, `BackgroundTask`, etc. | `'color_grade'` and `'lut'` in `TimelineOperation.type`, color fields, CDL/node types | Both add to `TimelineOperation.type` union — **additive, no conflict** |
| `src/core/timeline/clip-helpers.ts` | No changes | Extends `ActiveClipInfo` with `colorGrade?`, updates `findActiveClip()` | Field is optional — rendering imports compile without color grading |
| `src/ui/components/timeline/compositor.ts` | No changes (uses separate `FrameRenderer`) | Expands shader, bind group, `renderFrame()` signature, adds LUT textures | **No conflict** |
| `src/ui/store.ts` | `backgroundTasks`, `activeRender`, render CRUD | `lutCache`, `addLutFiles()` | Different state slices — **no conflict** |
| `src/ui/components/timeline/TimelineEditor.vue` | Adds Render button in tab bar | Adds Color tab | Different template areas — **low conflict risk** |

### Merge Checklist (when both plans are complete)

1. **Verify `FrameRenderer` applies color operations** — add `color_grade` handling to
   `Canvas2DFrameRenderer.applyOperations()`:
   - Read `ColorGradeParams` from the clip via `getClipColorGrade()` from `src/core/color/`
   - Apply via Canvas2D filters: `ctx.filter = 'brightness(...) contrast(...) saturate(...)'`
   - For LUT operations: use `applyLutToImageData()` from `src/core/color/lut.ts`
2. **Verify fingerprint invalidation** — change a color grade slider, re-render, confirm
   the segment is re-encoded (not cached)
3. **Extract WGSL shader to shared module** (if not already done) for the future WebGPU
   render worker path

## Decisions

- **WebGPU-first:** All color math runs in the WGSL fragment shader. Canvas2D fallback gets basic CSS filter approximation only — not a priority.
- **Core/UI split respected:** `ColorGradeParams`, `DEFAULT_COLOR_GRADE`, `COLOR_PROFILES`, `getClipColorGrade()`, `LutData`, `parseCubeFile()` are all pure TypeScript in `src/core/color/`. WebGPU shader code stays in `src/ui/components/timeline/compositor.ts`.
- **Single `color_grade` operation:** One operation type covers all basic controls (brightness, contrast, sat, exposure, temp, tint, RGB). Simpler than separate operation types per control.
- **Profiles are pure data:** Each profile is a `ColorGradeParams` object in `src/core/color/color-profiles.ts`. Applying a profile overwrites the slider values on the operation. No runtime logic.
- **Shader pipeline order:** exposure → temperature/tint → RGB gains → brightness → contrast → saturation → (LUT in Step 2) → opacity. This matches standard color science: linear-domain adjustments first, perceptual adjustments second.
- **Uniform buffer, not storage buffer:** 48 bytes fits comfortably in a uniform buffer (WebGPU min limit is 64KB). No need for storage buffers or push constants.
- **No new npm dependencies for Step 1:** Color profiles are hardcoded constants. `.cube` parsing (Step 2) is ~50 lines. Scopes use native Canvas2D.
- **`ActiveClipInfo.colorGrade` is optional:** Ensures rendering plan compiles without color grading code present.
