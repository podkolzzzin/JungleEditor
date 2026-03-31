/**
 * Export pipeline — encodes the final composed video/audio to a file.
 *
 * Uses:
 * - WebCodecs VideoEncoder / AudioEncoder for hardware-accelerated encoding
 * - MP4 muxing via mp4-muxer (or similar library)
 * - Web Workers for off-main-thread encoding
 * - Streams API (WritableStream) to progressively write output
 *
 * Supports:
 * - H.264 / H.265 / VP9 / AV1 video codecs
 * - AAC / Opus audio codecs
 * - MP4 / WebM containers
 */

export interface ExportOptions {
  width: number
  height: number
  fps: number
  videoBitrate: number
  audioBitrate: number
  videoCodec: 'avc1' | 'hvc1' | 'vp09' | 'av01'
  audioCodec: 'mp4a' | 'opus'
  container: 'mp4' | 'webm'
}

export class ExportPipeline {
  private _progress = 0

  get progress() {
    return this._progress
  }

  async start(_options: ExportOptions): Promise<Blob> {
    // TODO: implement full encode → mux → output pipeline
    throw new Error('Export pipeline not yet implemented')
  }

  cancel(): void {
    // TODO: signal abort to workers
  }
}
