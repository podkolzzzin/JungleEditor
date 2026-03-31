/**
 * Core domain types for Jungle Editor.
 *
 * These types represent the project data model that is serialised to disk
 * and drives the entire editing pipeline.
 */

// ─── Media ──────────────────────────────────────────────────────────

export type MediaType = 'video' | 'audio' | 'image'

export interface MediaItem {
  id: string
  name: string
  type: MediaType
  /** Object URL or remote URL */
  src: string
  /** Duration in seconds (0 for images) */
  duration: number
  /** Intrinsic width (0 for audio) */
  width: number
  /** Intrinsic height (0 for audio) */
  height: number
  /** MIME type, e.g. "video/mp4" */
  mimeType: string
  /** Size in bytes */
  fileSize: number
}

// ─── Timeline ───────────────────────────────────────────────────────

export interface Clip {
  id: string
  /** Reference to MediaItem.id */
  mediaId: string
  trackId: string
  /** Start position on the timeline in seconds */
  startTime: number
  /** Duration of the clip on the timeline in seconds */
  duration: number
  /** Offset into source media in seconds */
  sourceOffset: number
  /** Playback speed multiplier */
  speed: number
}

export interface Track {
  id: string
  name: string
  type: 'video' | 'audio'
  muted: boolean
  locked: boolean
  clips: Clip[]
}

// ─── Effects & Transitions ──────────────────────────────────────────

export interface Effect {
  id: string
  clipId: string
  type: string
  /** Effect-specific parameters */
  params: Record<string, unknown>
  enabled: boolean
}

export interface Transition {
  id: string
  type: string
  /** Duration in seconds */
  duration: number
  params: Record<string, unknown>
}

// ─── Project ────────────────────────────────────────────────────────

export interface ProjectSettings {
  /** Project frame width */
  width: number
  /** Project frame height */
  height: number
  /** Frames per second */
  fps: number
  /** Sample rate for audio */
  sampleRate: number
}

export interface Project {
  id: string
  name: string
  settings: ProjectSettings
  tracks: Track[]
  mediaItems: MediaItem[]
  /** Current playhead position in seconds */
  currentTime: number
}
