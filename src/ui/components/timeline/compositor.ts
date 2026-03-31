/**
 * Timeline Compositor — WebGPU multi-layer video renderer.
 *
 * Architecture:
 * - Each video layer is a full-screen quad rendered with premultiplied alpha blending
 * - Layers are composited bottom-to-top (track 0 = bottom)
 * - Per-layer: color grading (exposure, temperature, tint, RGB gains, brightness,
 *   contrast, saturation), crop region, opacity (with fade in/out)
 * - Letterboxing computed in vertex shader to avoid viewport hacks
 * - Uniform buffer pool (grows on demand) to avoid GPU stalls
 * - Single command buffer submission per frame for all layers
 *
 * No Canvas2D fallback — requires WebGPU (Chrome 113+).
 *
 * Clip helper functions live in core/timeline/clip-helpers.ts.
 * This module re-exports them for backward compatibility.
 */

// Re-export clip helpers (used by TimelinePlayer and other components)
export {
  getClipSpeed,
  getClipEffectiveDuration,
  computeClipOpacity,
  isClipMuted,
  findActiveClip,
  findAllActiveClips,
  type ActiveClipInfo,
} from '../../../core/timeline/clip-helpers'

import type { ColorGradeParams } from '../../../core/color'
import { DEFAULT_COLOR_GRADE } from '../../../core/color'

// ── Types ──

/** Descriptor for a single compositing layer */
export interface LayerDescriptor {
  /** The HTMLVideoElement with the current frame to render */
  video: HTMLVideoElement
  /** Opacity (0–1), typically from fade in/out */
  opacity: number
  /** Color grade parameters */
  colorGrade: ColorGradeParams
  /** Crop region in source UV space [x, y, width, height], default [0, 0, 1, 1] */
  crop?: [number, number, number, number]
}

// ── WGSL Shader ──
//
// Uniform layout (80 bytes = 20 × f32, 16-byte aligned):
//   [ 0] opacity      [ 1] brightness   [ 2] contrast     [ 3] saturation
//   [ 4] exposure     [ 5] temperature  [ 6] tint         [ 7] _pad
//   [ 8] rGain        [ 9] gGain        [10] bGain        [11] _pad
//   [12] cropX        [13] cropY        [14] cropW        [15] cropH
//   [16] videoAspect  [17] canvasAspect [18] _pad          [19] _pad

const SHADER = /* wgsl */ `
struct Params {
  opacity:      f32,
  brightness:   f32,
  contrast:     f32,
  saturation:   f32,
  exposure:     f32,
  temperature:  f32,
  tint:         f32,
  _pad1:        f32,
  rGain:        f32,
  gGain:        f32,
  bGain:        f32,
  _pad2:        f32,
  cropX:        f32,
  cropY:        f32,
  cropW:        f32,
  cropH:        f32,
  videoAspect:  f32,
  canvasAspect: f32,
  _pad3:        f32,
  _pad4:        f32,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_external;
@group(0) @binding(2) var<uniform> p: Params;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  // Compute letterbox quad: scale the quad to preserve video aspect ratio
  let va = p.videoAspect;
  let ca = p.canvasAspect;

  var sx: f32;
  var sy: f32;
  if (va > ca) {
    // Video wider than canvas -> fit width, letterbox top/bottom
    sx = 1.0;
    sy = ca / va;
  } else {
    // Video taller than canvas -> fit height, pillarbox left/right
    sx = va / ca;
    sy = 1.0;
  }

  // Full-screen quad (2 triangles, 6 vertices)
  var pos = array<vec2f, 6>(
    vec2f(-sx, -sy), vec2f( sx, -sy), vec2f(-sx,  sy),
    vec2f(-sx,  sy), vec2f( sx, -sy), vec2f( sx,  sy),
  );
  var uv = array<vec2f, 6>(
    vec2f(0, 1), vec2f(1, 1), vec2f(0, 0),
    vec2f(0, 0), vec2f(1, 1), vec2f(1, 0),
  );

  var out: VsOut;
  out.pos = vec4f(pos[i], 0, 1);
  // Map UVs through the crop region
  out.uv = vec2f(p.cropX, p.cropY) + uv[i] * vec2f(p.cropW, p.cropH);
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  var c = textureSampleBaseClampToEdge(tex, samp, in.uv).rgb;

  // 1. Exposure (EV stops)
  c *= pow(2.0, p.exposure);

  // 2. White balance: temperature (blue<>amber) and tint (green<>magenta)
  c.r += p.temperature * 0.1;
  c.b -= p.temperature * 0.1;
  c.g += p.tint * 0.1;
  c.r -= p.tint * 0.05;
  c.b -= p.tint * 0.05;

  // 3. Per-channel RGB gain
  c = vec3f(c.r * p.rGain, c.g * p.gGain, c.b * p.bGain);

  // 4. Brightness (additive offset)
  c += vec3f(p.brightness);

  // 5. Contrast (pivot at 0.5)
  c = (c - 0.5) * p.contrast + 0.5;

  // 6. Saturation (luminance-preserving)
  let lum = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(vec3f(lum), c, p.saturation);

  c = clamp(c, vec3f(0.0), vec3f(1.0));

  // Premultiplied alpha output for correct layer compositing
  let a = p.opacity;
  return vec4f(c * a, a);
}
`

/** Size of the uniform buffer in bytes (20 floats x 4) */
const PARAMS_BYTES = 80

// ── Compositor class ──

export class TimelineCompositor {
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private pipeline: GPURenderPipeline | null = null
  private sampler: GPUSampler | null = null
  private bindGroupLayout: GPUBindGroupLayout | null = null

  /** Pool of uniform buffers — one per concurrent layer, grows on demand */
  private paramsBufPool: GPUBuffer[] = []

  private _initialized = false

  /** Always true when initialized (WebGPU-only, no fallback) */
  get useWebGPU() { return this._initialized }
  get initialized() { return this._initialized }

  /**
   * Initialize the WebGPU compositor on the given canvas.
   * Throws if WebGPU is not available.
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) throw new Error('WebGPU not available — requires Chrome 113+')

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('No WebGPU adapter found')

    this.device = await adapter.requestDevice()

    // Handle async device loss (e.g. GPU reset, driver crash)
    this.device.lost.then((info) => {
      console.error('[Compositor] GPU device lost:', info.message)
      this._initialized = false
    })

    this.context = canvas.getContext('webgpu') as GPUCanvasContext
    if (!this.context) throw new Error('Could not obtain WebGPU canvas context')

    const format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({
      device: this.device,
      format,
      alphaMode: 'premultiplied',
    })

    this.sampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    })

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    })

    const shaderModule = this.device.createShaderModule({ code: SHADER })

    // Async pipeline creation avoids blocking the main thread during shader compilation
    this.pipeline = await this.device.createRenderPipelineAsync({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vs' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            // Premultiplied alpha blending: result = src + dst * (1 - srcAlpha)
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
    })

    // Pre-allocate 4 uniform buffers (typical layer count without extra allocation)
    for (let i = 0; i < 4; i++) {
      this.paramsBufPool.push(this.device.createBuffer({
        size: PARAMS_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }))
    }

    this._initialized = true
    console.log('[Compositor] WebGPU multi-layer compositor initialized')
  }

  /** Get or create a uniform buffer at the given pool index */
  private getParamsBuf(index: number): GPUBuffer {
    while (this.paramsBufPool.length <= index) {
      this.paramsBufPool.push(this.device!.createBuffer({
        size: PARAMS_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }))
    }
    return this.paramsBufPool[index]
  }

  /**
   * Render multiple video layers composited together.
   * Layers are rendered bottom-to-top with premultiplied alpha blending.
   * All layers are encoded into a single command buffer for minimal GPU overhead.
   *
   * @returns true if all layers rendered successfully
   */
  renderLayers(layers: LayerDescriptor[]): boolean {
    if (!this._initialized || !this.device || !this.context ||
        !this.pipeline || !this.sampler || !this.bindGroupLayout) return false

    try {
      const tex = this.context.getCurrentTexture()
      const cw = tex.width
      const ch = tex.height
      const canvasAspect = cw / ch
      const view = tex.createView()

      const encoder = this.device.createCommandEncoder()

      if (layers.length === 0) {
        // No layers — clear to black
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
        })
        pass.end()
      } else {
        for (let i = 0; i < layers.length; i++) {
          const layer = layers[i]
          const cg = layer.colorGrade
          const crop = layer.crop ?? [0, 0, 1, 1]

          // Compute cropped video aspect ratio for correct letterboxing
          const vw = layer.video.videoWidth || cw
          const vh = layer.video.videoHeight || ch
          const croppedAspect = (vw * crop[2]) / (vh * crop[3])

          // Write per-layer parameters to its own uniform buffer
          const buf = this.getParamsBuf(i)
          this.device.queue.writeBuffer(buf, 0, new Float32Array([
            layer.opacity,
            cg.brightness, cg.contrast, cg.saturation,
            cg.exposure, cg.temperature, cg.tint, 0,
            cg.rGain, cg.gGain, cg.bGain, 0,
            crop[0], crop[1], crop[2], crop[3],
            croppedAspect, canvasAspect, 0, 0,
          ]))

          // Import the video frame as an external texture (zero-copy on supported HW)
          const extTex = this.device.importExternalTexture({ source: layer.video })

          const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
              { binding: 0, resource: this.sampler },
              { binding: 1, resource: extTex },
              { binding: 2, resource: { buffer: buf } },
            ],
          })

          // First layer clears to black; subsequent layers blend on top
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view,
              loadOp: i === 0 ? 'clear' : 'load',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            }],
          })

          pass.setPipeline(this.pipeline)
          pass.setBindGroup(0, bindGroup)
          pass.draw(6)
          pass.end()
        }
      }

      // Single submit — all layers in one GPU command buffer
      this.device.queue.submit([encoder.finish()])
      return true
    } catch (_e) {
      // importExternalTexture throws if the video element isn't ready (readyState < 2).
      // Expected during initial load — caller retries next frame.
      return false
    }
  }

  /**
   * Render a single video frame (backward-compatible convenience wrapper).
   */
  renderFrame(video: HTMLVideoElement, opacity: number, colorGrade: ColorGradeParams = DEFAULT_COLOR_GRADE): boolean {
    return this.renderLayers([{ video, opacity, colorGrade }])
  }

  /** Clear the canvas to black (when no clips are active) */
  renderBlack(): void {
    if (!this.device || !this.context) return
    try {
      const encoder = this.device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      })
      pass.end()
      this.device.queue.submit([encoder.finish()])
    } catch {
      // Device lost — nothing to do
    }
  }

  /** Release all GPU resources */
  destroy(): void {
    this._initialized = false
    for (const buf of this.paramsBufPool) buf.destroy()
    this.paramsBufPool = []
    this.device?.destroy()
    this.device = null
    this.context = null
    this.pipeline = null
    this.sampler = null
    this.bindGroupLayout = null
  }
}
