/**
 * Timeline Compositor — WebGPU-accelerated multi-layer video frame renderer.
 *
 * Architecture:
 * - Pure WebGPU pipeline, no Canvas2D fallback.
 * - Multi-layer compositing: renders all active clips in painter's order.
 * - Full color grading pipeline in WGSL (exposure, temperature, tint, RGB gains,
 *   brightness, contrast, saturation).
 * - Alpha blending between layers for opacity/fades.
 * - Viewport-based letterboxing for aspect ratio preservation.
 * - Per-frame bind group creation (required for external textures which are
 *   only valid for the current microtask).
 * - Pipeline pre-compilation via createRenderPipelineAsync.
 *
 * Clip helper functions live in core/timeline/clip-helpers.ts.
 * This module re-exports them for backward compatibility.
 */

// Re-export clip helpers from core (used by TimelinePlayer and other components)
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

// ── WGSL Shader — color grading + alpha blending ──

const SHADER_CODE = /* wgsl */ `
struct Params {
  opacity:     f32,
  brightness:  f32,
  contrast:    f32,
  saturation:  f32,  // 16 bytes — vec4 aligned
  exposure:    f32,
  temperature: f32,
  tint:        f32,
  _pad1:       f32,  // 32 bytes
  rGain:       f32,
  gGain:       f32,
  bGain:       f32,
  _pad2:       f32,  // 48 bytes
}

@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_external;
@group(0) @binding(2) var<uniform> params: Params;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) idx: u32) -> VertexOutput {
  // Full-screen triangle pair (no vertex buffer needed)
  var positions = array<vec2f, 6>(
    vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
    vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1),
  );
  var uvs = array<vec2f, 6>(
    vec2f(0, 1), vec2f(1, 1), vec2f(0, 0),
    vec2f(0, 0), vec2f(1, 1), vec2f(1, 0),
  );
  var out: VertexOutput;
  out.position = vec4f(positions[idx], 0, 1);
  out.uv = uvs[idx];
  return out;
}

@fragment
fn fs(in: VertexOutput) -> @location(0) vec4f {
  var c = textureSampleBaseClampToEdge(myTexture, mySampler, in.uv).rgb;

  // 1. Exposure (EV stops — multiplicative in linear space)
  c *= pow(2.0, params.exposure);

  // 2. Temperature & tint (simplified RGB-space shift)
  c.r += params.temperature * 0.1;
  c.b -= params.temperature * 0.1;
  c.g += params.tint * 0.1;
  c.r -= params.tint * 0.05;
  c.b -= params.tint * 0.05;

  // 3. Per-channel gains
  c = vec3f(c.r * params.rGain, c.g * params.gGain, c.b * params.bGain);

  // 4. Brightness (additive)
  c += vec3f(params.brightness);

  // 5. Contrast (pivot at mid-gray 0.5)
  c = (c - vec3f(0.5)) * params.contrast + vec3f(0.5);

  // 6. Saturation (Rec.709 luminance-preserving)
  let lum = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(vec3f(lum), c, params.saturation);

  // 7. Clamp & apply opacity as pre-multiplied alpha
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  return vec4f(c * params.opacity, params.opacity);
}
`

/** Size of the uniform buffer in bytes (12 floats × 4 bytes = 48) */
const PARAMS_BUFFER_SIZE = 48

/** Information needed to render one layer */
export interface LayerRenderInfo {
  video: HTMLVideoElement
  opacity: number
  colorGrade: ColorGradeParams
}

// ── Compositor class ──

export class TimelineCompositor {
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private canvasFormat: GPUTextureFormat = 'bgra8unorm'

  // Pipeline (pre-compiled, reused across frames)
  private pipeline: GPURenderPipeline | null = null
  private sampler: GPUSampler | null = null
  private bindGroupLayout: GPUBindGroupLayout | null = null

  // Double-buffered uniform uploads: alternate between two buffers each frame
  // to avoid CPU–GPU stalls from writing to a buffer the GPU is still reading.
  private paramsBuffers: [GPUBuffer, GPUBuffer] | null = null
  private paramsBufferIndex = 0

  private _useWebGPU = false
  private _initialized = false

  // Canvas2D fallback for environments without WebGPU (e.g. headless test runners)
  private ctx2d: CanvasRenderingContext2D | null = null

  get useWebGPU() { return this._useWebGPU }
  get initialized() { return this._initialized }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    try {
      if (!navigator.gpu) throw new Error('WebGPU not supported')

      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      })
      if (!adapter) throw new Error('No GPU adapter found')

      this.device = await adapter.requestDevice()

      this.context = canvas.getContext('webgpu') as GPUCanvasContext
      if (!this.context) throw new Error('Could not get webgpu context')

      this.canvasFormat = navigator.gpu.getPreferredCanvasFormat()
      this.context.configure({
        device: this.device,
        format: this.canvasFormat,
        alphaMode: 'opaque',
      })

      // Bilinear sampler for video texture scaling
      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      })

      // Double-buffered uniform buffers
      this.paramsBuffers = [
        this.device.createBuffer({ size: PARAMS_BUFFER_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        this.device.createBuffer({ size: PARAMS_BUFFER_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      ]

      this.bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      })

      const shaderModule = this.device.createShaderModule({ code: SHADER_CODE })

      // Async compilation avoids main-thread stall during shader compile
      this.pipeline = await this.device.createRenderPipelineAsync({
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [this.bindGroupLayout],
        }),
        vertex: { module: shaderModule, entryPoint: 'vs' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs',
          targets: [{
            format: this.canvasFormat,
            // Pre-multiplied alpha blending for multi-layer compositing
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
      })

      this._useWebGPU = true
      this._initialized = true
      console.log('[Compositor] WebGPU initialized (multi-layer, color-grading)')
    } catch (e) {
      console.warn('[Compositor] WebGPU unavailable, using Canvas2D fallback:', e)
      this.ctx2d = canvas.getContext('2d')
      this._useWebGPU = false
      this._initialized = true
    }
  }

  /**
   * Render multiple video layers composited together (painter's order).
   * Each layer is drawn with its own color grade and opacity.
   * Returns true if at least one layer was rendered.
   */
  renderLayers(layers: LayerRenderInfo[]): boolean {
    if (this._useWebGPU) {
      return this.renderLayersGPU(layers)
    }
    return this.renderLayersCanvas2D(layers)
  }

  /** Render a single video frame (backward-compatible convenience wrapper). */
  renderFrame(video: HTMLVideoElement, opacity: number, cg: ColorGradeParams = DEFAULT_COLOR_GRADE): boolean {
    return this.renderLayers([{ video, opacity, colorGrade: cg }])
  }

  /** Clear to black (when no clip is active). */
  renderBlack(): void {
    if (this._useWebGPU && this.device && this.context) {
      const commandEncoder = this.device.createCommandEncoder()
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      })
      pass.end()
      this.device.queue.submit([commandEncoder.finish()])
    } else if (this.ctx2d) {
      const { width, height } = this.ctx2d.canvas
      this.ctx2d.fillStyle = '#000'
      this.ctx2d.fillRect(0, 0, width, height)
    }
  }

  // ── WebGPU multi-layer rendering ──

  private renderLayersGPU(layers: LayerRenderInfo[]): boolean {
    if (!this.device || !this.context || !this.pipeline ||
        !this.sampler || !this.paramsBuffers || !this.bindGroupLayout) return false

    if (layers.length === 0) {
      this.renderBlack()
      return true
    }

    const tex = this.context.getCurrentTexture()
    const cw = tex.width
    const ch = tex.height
    const texView = tex.createView()

    const commandEncoder = this.device.createCommandEncoder()
    let rendered = false

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]
      const video = layer.video

      if (video.readyState < 2) continue // Skip frames that aren't decoded yet

      try {
        // Alternate between two uniform buffers to avoid GPU stalls
        const paramsBuffer = this.paramsBuffers[this.paramsBufferIndex]
        this.paramsBufferIndex = (this.paramsBufferIndex + 1) & 1

        const cg = layer.colorGrade
        this.device.queue.writeBuffer(
          paramsBuffer, 0,
          new Float32Array([
            layer.opacity, cg.brightness, cg.contrast, cg.saturation,
            cg.exposure, cg.temperature, cg.tint, 0,
            cg.rGain, cg.gGain, cg.bGain, 0,
          ]),
        )

        const externalTexture = this.device.importExternalTexture({ source: video })

        const bindGroup = this.device.createBindGroup({
          layout: this.bindGroupLayout,
          entries: [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: externalTexture },
            { binding: 2, resource: { buffer: paramsBuffer } },
          ],
        })

        // First layer clears; subsequent layers blend on top
        const loadOp: GPULoadOp = (i === 0 && !rendered) ? 'clear' : 'load'

        const pass = commandEncoder.beginRenderPass({
          colorAttachments: [{
            view: texView,
            loadOp,
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          }],
        })

        // Letterbox: preserve video aspect ratio within the canvas
        const vw = video.videoWidth || cw
        const vh = video.videoHeight || ch
        const scale = Math.min(cw / vw, ch / vh)
        const dw = Math.round(vw * scale)
        const dh = Math.round(vh * scale)
        const dx = Math.round((cw - dw) / 2)
        const dy = Math.round((ch - dh) / 2)
        pass.setViewport(dx, dy, dw, dh, 0, 1)

        pass.setPipeline(this.pipeline)
        pass.setBindGroup(0, bindGroup)
        pass.draw(6)
        pass.end()

        rendered = true
      } catch (_e) {
        // importExternalTexture throws if the video frame isn't ready
        continue
      }
    }

    // If no layer rendered, clear to black
    if (!rendered) {
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: texView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      })
      pass.end()
    }

    this.device.queue.submit([commandEncoder.finish()])
    return rendered
  }

  // ── Canvas2D fallback (for headless/test environments) ──

  private renderLayersCanvas2D(layers: LayerRenderInfo[]): boolean {
    if (!this.ctx2d) return false
    const { width, height } = this.ctx2d.canvas
    this.ctx2d.clearRect(0, 0, width, height)
    this.ctx2d.fillStyle = '#000'
    this.ctx2d.fillRect(0, 0, width, height)

    let rendered = false
    for (const layer of layers) {
      const video = layer.video
      if (video.readyState < 2) continue

      const cg = layer.colorGrade
      const brightnessVal = 1 + cg.brightness
      this.ctx2d.filter = `brightness(${brightnessVal}) contrast(${cg.contrast}) saturate(${cg.saturation})`
      this.ctx2d.globalAlpha = layer.opacity

      const vw = video.videoWidth || width
      const vh = video.videoHeight || height
      const scale = Math.min(width / vw, height / vh)
      const dw = vw * scale
      const dh = vh * scale
      const dx = (width - dw) / 2
      const dy = (height - dh) / 2

      this.ctx2d.drawImage(video, dx, dy, dw, dh)
      rendered = true
    }

    this.ctx2d.globalAlpha = 1
    this.ctx2d.filter = 'none'
    return rendered
  }

  destroy(): void {
    this._initialized = false
    this.paramsBuffers?.[0]?.destroy()
    this.paramsBuffers?.[1]?.destroy()
    this.device?.destroy()
    this.device = null
    this.context = null
    this.pipeline = null
    this.sampler = null
    this.paramsBuffers = null
    this.bindGroupLayout = null
    this.ctx2d = null
  }
}
