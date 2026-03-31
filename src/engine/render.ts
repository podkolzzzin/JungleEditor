/**
 * WebGPU-based rendering engine for the video preview and export pipeline.
 *
 * Responsibilities:
 * - Composite video frames from multiple tracks
 * - Apply GPU-accelerated effects (color grading, transforms, blend modes)
 * - Drive the preview canvas at the project frame rate
 * - Provide frame-accurate rendering for export
 *
 * This module initialises a GPUDevice on first use and manages GPU resources
 * (textures, pipelines, bind groups) for the lifetime of the editor session.
 */

export class RenderEngine {
  private device: GPUDevice | null = null
  private context: GPUCanvasContext | null = null

  async init(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!navigator.gpu) {
      console.warn('[RenderEngine] WebGPU not supported — falling back to Canvas2D')
      return false
    }

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      console.warn('[RenderEngine] No GPUAdapter available')
      return false
    }

    this.device = await adapter.requestDevice()
    this.context = canvas.getContext('webgpu') as GPUCanvasContext

    const format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({
      device: this.device,
      format,
      alphaMode: 'premultiplied',
    })

    console.info('[RenderEngine] WebGPU initialised', {
      adapter: adapter.info,
    })

    return true
  }

  /**
   * Render a single composite frame at the given timestamp.
   */
  renderFrame(_timestamp: number): void {
    if (!this.device || !this.context) return
    // TODO: build command encoder, draw calls, present
  }

  destroy(): void {
    this.device?.destroy()
    this.device = null
    this.context = null
  }
}
