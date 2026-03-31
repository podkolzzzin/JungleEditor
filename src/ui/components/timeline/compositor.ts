/**
 * Timeline Compositor — WebGPU-accelerated video frame renderer
 * with Canvas2D fallback.
 *
 * Clip helper functions are in core/timeline/clip-helpers.ts.
 * This module re-exports them for backward compatibility.
 */

// Re-export clip helpers from core (used by TimelinePlayer and other components)
export {
  getClipSpeed,
  getClipEffectiveDuration,
  computeClipOpacity,
  isClipMuted,
  findActiveClip,
  type ActiveClipInfo,
} from '../../../core/timeline/clip-helpers'

// ── WebGPU Shader ──

const SHADER_CODE = /* wgsl */ `
struct Params {
  opacity: f32,
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
  let color = textureSampleBaseClampToEdge(myTexture, mySampler, in.uv);
  return vec4f(color.rgb * params.opacity, 1.0);
}
`

// ── Compositor class ──

export class TimelineCompositor {
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null
  private pipeline: GPURenderPipeline | null = null
  private sampler: GPUSampler | null = null
  private paramsBuffer: GPUBuffer | null = null
  private bindGroupLayout: GPUBindGroupLayout | null = null

  // Canvas2D fallback
  private ctx2d: CanvasRenderingContext2D | null = null
  private _useWebGPU = false

  get useWebGPU() { return this._useWebGPU }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    try {
      if (!navigator.gpu) throw new Error('WebGPU not supported')

      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) throw new Error('No GPU adapter found')

      this.device = await adapter.requestDevice()

      this.context = canvas.getContext('webgpu') as GPUCanvasContext
      if (!this.context) throw new Error('Could not get webgpu context')

      const format = navigator.gpu.getPreferredCanvasFormat()
      this.context.configure({
        device: this.device,
        format,
        alphaMode: 'opaque',
      })

      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      })

      this.paramsBuffer = this.device.createBuffer({
        size: 16, // vec4-aligned
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      this.bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      })

      const shaderModule = this.device.createShaderModule({ code: SHADER_CODE })

      this.pipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [this.bindGroupLayout],
        }),
        vertex: { module: shaderModule, entryPoint: 'vs' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs',
          targets: [{ format }],
        },
      })

      this._useWebGPU = true
      console.log('[Compositor] WebGPU initialized')
    } catch (e) {
      console.warn('[Compositor] WebGPU unavailable, using Canvas2D fallback:', e)
      this.ctx2d = canvas.getContext('2d')
      this._useWebGPU = false
    }
  }

  /** Render a video frame with the given opacity. Returns true if rendered successfully. */
  renderFrame(video: HTMLVideoElement, opacity: number): boolean {
    if (this._useWebGPU) {
      return this.renderWebGPU(video, opacity)
    } else {
      return this.renderCanvas2D(video, opacity)
    }
  }

  /** Render a black frame (when no clip is active) */
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

  private renderWebGPU(video: HTMLVideoElement, opacity: number): boolean {
    if (!this.device || !this.context || !this.pipeline ||
        !this.sampler || !this.paramsBuffer || !this.bindGroupLayout) return false

    try {
      this.device.queue.writeBuffer(
        this.paramsBuffer, 0,
        new Float32Array([opacity, 0, 0, 0]),
      )

      const externalTexture = this.device.importExternalTexture({ source: video })

      const bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: externalTexture },
          { binding: 2, resource: { buffer: this.paramsBuffer } },
        ],
      })

      const tex = this.context.getCurrentTexture()
      const cw = tex.width
      const ch = tex.height

      const commandEncoder = this.device.createCommandEncoder()
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: tex.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      })

      // Letterbox: compute viewport that preserves the video's aspect ratio
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

      this.device.queue.submit([commandEncoder.finish()])
      return true
    } catch (_e) {
      // importExternalTexture can throw if video isn't ready yet
      return false
    }
  }

  private renderCanvas2D(video: HTMLVideoElement, opacity: number): boolean {
    if (!this.ctx2d) return false
    const { width, height } = this.ctx2d.canvas
    this.ctx2d.clearRect(0, 0, width, height)
    this.ctx2d.fillStyle = '#000'
    this.ctx2d.fillRect(0, 0, width, height)

    if (video.readyState < 2) return false // HAVE_CURRENT_DATA

    this.ctx2d.globalAlpha = opacity

    // Maintain aspect ratio
    const vw = video.videoWidth || width
    const vh = video.videoHeight || height
    const scale = Math.min(width / vw, height / vh)
    const dw = vw * scale
    const dh = vh * scale
    const dx = (width - dw) / 2
    const dy = (height - dh) / 2

    this.ctx2d.drawImage(video, dx, dy, dw, dh)
    this.ctx2d.globalAlpha = 1
    return true
  }

  destroy(): void {
    this.device?.destroy()
    this.device = null
    this.context = null
    this.pipeline = null
    this.sampler = null
    this.paramsBuffer = null
    this.bindGroupLayout = null
    this.ctx2d = null
  }
}
