/**
 * Core type definitions for Jungle Editor.
 * These types are UI-agnostic and can be used in any runtime (browser, Node.js CLI, etc.).
 */

// ── File / Project types ──

export interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileNode[]

  /** UUID linking to .source file (files only) */
  sourceId?: string

  /**
   * Runtime resource URL for playback (e.g. blob URL in the browser).
   * Set by the host platform, not serialized.
   */
  url?: string

  /**
   * Platform-specific file handle (e.g. FileSystemFileHandle in the browser).
   * Set by the host platform, not serialized.
   */
  handle?: unknown

  /** Permission state after reload */
  permissionState?: 'granted' | 'prompt' | 'denied'

  /** Virtual folder path stored in .source file */
  path?: string

  /** Whether folder is expanded in UI */
  expanded?: boolean

  /** File size in bytes (from .source metadata) */
  size?: number

  /** MIME type (from .source metadata) */
  mimeType?: string

  /** ISO date string when the file was added */
  added?: string
}

/** Metadata parsed from a .source text file */
export interface SourceMetadata {
  id: string
  name: string
  size: number
  type: string
  added: string
  path: string
}

/** Metadata stored alongside a timeline in sources/ for tree placement */
export interface TimelineSourceMeta {
  id: string
  name: string
  path: string
  created: string
}

/** Folder marker metadata */
export interface FolderMeta {
  id: string
  name: string
  path: string
}

// ── Timeline types ──

/** A single clip referencing a video source with in/out points */
export interface TimelineClip {
  /** Reference to a source file (sourceId from the project) */
  sourceId: string
  /** Display name of the source (for human readability in YAML) */
  sourceName?: string
  /** Start time in the source video (seconds) */
  in: number
  /** End time in the source video (seconds) */
  out: number
  /** Offset from timeline start (seconds). Determines clip position on the track. */
  offset?: number
  /** Operations/transformations applied to this clip */
  operations?: TimelineOperation[]
}

/** A transformation/operation applied to a clip */
export interface TimelineOperation {
  type: 'cut' | 'remove_segment' | 'speed' | 'fade_in' | 'fade_out' | 'mute' | 'color_grade'
  /** For cut: the time point to split at (seconds) */
  at?: number
  /** For remove_segment: start of removed range (seconds, relative to clip) */
  from?: number
  /** For remove_segment: end of removed range (seconds, relative to clip) */
  to?: number
  /** For speed: playback rate multiplier */
  rate?: number
  /** For fade_in/fade_out: duration in seconds */
  duration?: number
  // ── Color grade fields (for type: 'color_grade') ──
  /** Additive brightness adjustment (-1 to +1, default 0) */
  brightness?: number
  /** Contrast multiplier (0 to 3, default 1) */
  contrast?: number
  /** Saturation multiplier (0 to 3, default 1) */
  saturation?: number
  /** Exposure in EV stops (-3 to +3, default 0) */
  exposure?: number
  /** Color temperature shift (-1 cool to +1 warm, default 0) */
  temperature?: number
  /** Tint shift (-1 green to +1 magenta, default 0) */
  tint?: number
  /** Red channel gain (0 to 2, default 1) */
  rGain?: number
  /** Green channel gain (0 to 2, default 1) */
  gGain?: number
  /** Blue channel gain (0 to 2, default 1) */
  bGain?: number
  /** Name of an applied built-in color profile (optional) */
  profileName?: string
}

/** A named track containing ordered clips */
export interface TimelineTrack {
  name: string
  clips: TimelineClip[]
  /** Track volume level (0+). Defaults to 1.0 when undefined. Values above 1 amplify. */
  volume?: number
}

/** The full timeline document structure (maps to YAML) */
export interface TimelineDocument {
  name: string
  created: string
  modified: string
  resolution?: string
  fps?: number
  tracks: TimelineTrack[]
}

// ── Compressor types ──

export interface CompressSettings {
  codec: 'avc1.640028' | 'vp09.00.10.08' | 'av01.0.04M.08'
  container: 'mp4' | 'webm'
  videoBitrate: number      // bps, e.g. 4_000_000
  audioBitrate: number      // bps, e.g. 128_000
  scaleWidth?: number       // optional output width (maintains aspect ratio)
  scaleHeight?: number
  framerate?: number        // optional fps override
}

export type CompressStatus = 'idle' | 'checking' | 'encoding' | 'done' | 'error' | 'cancelled'

export interface CompressProgress {
  percent: number
  fps: number
  etaSeconds: number
}

// ── Render types ──

/** Resolution preset for rendering */
export interface ResolutionPreset {
  label: string
  width: number
  height: number
}

/** Standard resolution presets */
export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '4K', width: 3840, height: 2160 },
]

/** Render profile — codec/quality/resolution settings for rendering */
export interface RenderProfile {
  name: string
  container: 'mp4' | 'webm'
  videoCodec: string
  resolution: { width: number; height: number; label: string }
  fps: number
  qualityPreset: 'low' | 'medium' | 'high' | 'lossless'
  includeAudio: boolean
  audioBitrate: number
}

/** Render document stored in .render files */
export interface RenderDocument {
  name: string
  timelineId: string
  timelineName: string
  profile: RenderProfile
  created: string
  modified: string
}

/** Generic background task status */
export type BackgroundTaskStatus = 'queued' | 'running' | 'paused' | 'complete' | 'failed'

/** Generic background task */
export interface BackgroundTask {
  id: string
  type: string
  label: string
  status: BackgroundTaskStatus
  /** Progress 0–1 */
  progress: number
  startedAt?: string
  completedAt?: string
  error?: string
  canPause: boolean
  canCancel: boolean
}

/** Render-specific background task */
export interface RenderTask extends BackgroundTask {
  type: 'render'
  renderJobId: string
  timelineName: string
  profileName: string
  currentSegment: number
  totalSegments: number
  estimatedRemaining?: number
}

/** Status of a single render segment */
export type RenderSegmentStatus = 'pending' | 'rendering' | 'complete' | 'failed'

/** Metadata for a single render segment */
export interface RenderSegmentMeta {
  index: number
  startTime: number
  endTime: number
  duration: number
  fingerprint: string
  status: RenderSegmentStatus
  framesRendered: number
  totalFrames: number
  fileSize?: number
  opfsPath: string
}

/** Status of an entire render job */
export type RenderJobStatus = 'pending' | 'running' | 'paused' | 'complete' | 'failed' | 'cancelled'

/** Persistent render job metadata (stored in IndexedDB) */
export interface RenderJob {
  id: string
  timelineName: string
  status: RenderJobStatus
  profile: RenderProfile
  timelineSnapshot: TimelineDocument
  segments: RenderSegmentMeta[]
  progress: number
  createdAt: string
  updatedAt: string
}

// ── Utility: check if a file node is a timeline ──

export function isTimelineNode(node: FileNode): boolean {
  return node.mimeType === 'application/x-timeline' || node.name.endsWith('.timeline')
}

/** Check if a file node is a render profile */
export function isRenderNode(node: FileNode): boolean {
  return node.mimeType === 'application/x-render' || node.name.endsWith('.render')
}

// ── Utility: find a node by ID in a tree ──

export function findNodeById(nodeId: string, list: FileNode[]): FileNode | null {
  for (const n of list) {
    if (n.id === nodeId) return n
    if (n.children) {
      const found = findNodeById(nodeId, n.children)
      if (found) return found
    }
  }
  return null
}
