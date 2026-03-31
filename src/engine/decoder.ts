/**
 * Decoder service — wraps the WebCodecs API for hardware-accelerated
 * demuxing and decoding of video / audio streams.
 *
 * Responsibilities:
 * - Demux containers (MP4, WebM) using MP4Box.js or WebCodecs + BYOB streams
 * - Decode individual video frames as VideoFrame objects
 * - Decode audio samples as AudioData objects
 * - Maintain a frame cache/pool for seeking and scrubbing
 *
 * Future: consider using WebTransport streams for remote media.
 */

export class DecoderService {
  /**
   * Check whether the current browser supports the WebCodecs API.
   */
  static isSupported(): boolean {
    return (
      typeof VideoDecoder !== 'undefined' &&
      typeof AudioDecoder !== 'undefined'
    )
  }

  // Placeholder — full implementation will manage decoder instances per clip
}
