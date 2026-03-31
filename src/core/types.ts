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
  type: 'cut' | 'remove_segment' | 'speed' | 'fade_in' | 'fade_out' | 'mute'
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
}

/** A named track containing ordered clips */
export interface TimelineTrack {
  name: string
  clips: TimelineClip[]
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

// ── Utility: check if a file node is a timeline ──

export function isTimelineNode(node: FileNode): boolean {
  return node.mimeType === 'application/x-timeline' || node.name.endsWith('.timeline')
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
