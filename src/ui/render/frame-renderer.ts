/**
 * Frame renderer abstraction for offline rendering.
 * Initial implementation uses Canvas2D on OffscreenCanvas.
 * Extensible for WebGPU in the future.
 */

import type { TimelineClip } from '../../core/types'
import { computeClipOpacity } from '../../core/timeline/clip-helpers'

/** Interface for a frame renderer that composites decoded video frames */
export interface FrameRenderer {
  init(width: number, height: number): Promise<void>
  renderFrame(videoFrame: VideoFrame, clip: TimelineClip, localTime: number): VideoFrame
  destroy(): void
}

/**
 * Canvas2D-based frame renderer.
 * Draws decoded VideoFrames onto an OffscreenCanvas with opacity and operations.
 */
export class Canvas2DFrameRenderer implements FrameRenderer {
  private canvas: OffscreenCanvas | null = null
  private ctx: OffscreenCanvasRenderingContext2D | null = null
  private width = 0
  private height = 0

  async init(width: number, height: number): Promise<void> {
    this.width = width
    this.height = height
    this.canvas = new OffscreenCanvas(width, height)
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas')
    this.ctx = ctx
  }

  renderFrame(videoFrame: VideoFrame, clip: TimelineClip, localTime: number): VideoFrame {
    if (!this.canvas || !this.ctx) {
      throw new Error('FrameRenderer not initialized')
    }

    const ctx = this.ctx

    // Clear canvas
    ctx.clearRect(0, 0, this.width, this.height)

    // Compute opacity from fade operations
    const opacity = computeClipOpacity(clip, localTime)
    ctx.globalAlpha = opacity

    // Draw the video frame with letterboxing
    const srcW = videoFrame.displayWidth
    const srcH = videoFrame.displayHeight
    const scale = Math.min(this.width / srcW, this.height / srcH)
    const dstW = srcW * scale
    const dstH = srcH * scale
    const dstX = (this.width - dstW) / 2
    const dstY = (this.height - dstH) / 2

    // Fill black background
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, this.width, this.height)

    // Draw frame with opacity
    ctx.globalAlpha = opacity
    ctx.drawImage(videoFrame, dstX, dstY, dstW, dstH)

    // Apply visual operations (extensible — unknown types are skipped)
    this.applyOperations(ctx, clip, localTime)

    // Reset alpha
    ctx.globalAlpha = 1

    // Create a new VideoFrame from the canvas
    const outputFrame = new VideoFrame(this.canvas, {
      timestamp: videoFrame.timestamp,
      duration: videoFrame.duration ?? undefined,
    })

    return outputFrame
  }

  /**
   * Apply visual operations to the canvas.
   * Currently a no-op for unknown operation types.
   * Extension point for color grading and other visual effects.
   */
  private applyOperations(
    _ctx: OffscreenCanvasRenderingContext2D,
    clip: TimelineClip,
    _localTime: number,
  ): void {
    if (!clip.operations) return

    for (const op of clip.operations) {
      switch (op.type) {
        case 'color_grade':
          // Color grade operations will be applied here when the color grading
          // module is integrated. The fingerprint already includes operations,
          // so cache invalidation works automatically.
          break
        // Other visual operation types can be added here
        default:
          // Skip non-visual operations (speed, mute, etc.)
          break
      }
    }
  }

  destroy(): void {
    this.canvas = null
    this.ctx = null
  }
}
