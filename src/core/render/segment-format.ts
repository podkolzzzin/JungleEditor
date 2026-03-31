/**
 * Binary envelope for serializing/deserializing rendered segment data.
 * Used for OPFS storage of encoded segment chunks.
 *
 * Format: [header (20 bytes)] [fingerprint (64 bytes)] [video data] [audio data]
 * Header: magic (4) | version (2) | videoLen (4) | audioLen (4) | duration_ms (4) | flags (2)
 */

const MAGIC = 0x4A524E44 // 'JRND'
const VERSION = 1

export interface SegmentData {
  fingerprint: string
  duration: number
  videoData: Uint8Array
  audioData: Uint8Array
}

/**
 * Serialize segment data into a binary envelope.
 */
export function serializeSegmentData(
  videoData: Uint8Array,
  audioData: Uint8Array,
  fingerprint: string,
  duration: number,
): Uint8Array {
  const fpBytes = new TextEncoder().encode(fingerprint.padEnd(64, '\0').slice(0, 64))
  const headerSize = 20
  const totalSize = headerSize + 64 + videoData.length + audioData.length
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // Header
  view.setUint32(0, MAGIC, false)
  view.setUint16(4, VERSION, false)
  view.setUint32(6, videoData.length, false)
  view.setUint32(10, audioData.length, false)
  view.setUint32(14, Math.round(duration * 1000), false)
  view.setUint16(18, 0, false) // flags reserved

  // Fingerprint
  bytes.set(fpBytes, headerSize)

  // Payload
  bytes.set(videoData, headerSize + 64)
  bytes.set(audioData, headerSize + 64 + videoData.length)

  return bytes
}

/**
 * Deserialize segment data from a binary envelope.
 * Returns null if the data is invalid.
 */
export function deserializeSegmentData(data: Uint8Array): SegmentData | null {
  if (data.length < 84) return null // 20 header + 64 fingerprint minimum

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const magic = view.getUint32(0, false)
  if (magic !== MAGIC) return null

  const version = view.getUint16(4, false)
  if (version !== VERSION) return null

  const videoLen = view.getUint32(6, false)
  const audioLen = view.getUint32(10, false)
  const durationMs = view.getUint32(14, false)

  const headerSize = 20
  const expectedSize = headerSize + 64 + videoLen + audioLen
  if (data.length < expectedSize) return null

  const fpBytes = data.slice(headerSize, headerSize + 64)
  const fingerprint = new TextDecoder().decode(fpBytes).replace(/\0+$/, '')

  const videoData = data.slice(headerSize + 64, headerSize + 64 + videoLen)
  const audioData = data.slice(headerSize + 64 + videoLen, headerSize + 64 + videoLen + audioLen)

  return {
    fingerprint,
    duration: durationMs / 1000,
    videoData,
    audioData,
  }
}
