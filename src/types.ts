export interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileNode[]

  /** UUID linking to .source file + IndexedDB handle (files only) */
  sourceId?: string

  /** Runtime blob URL for video playback */
  url?: string

  /** File System Access API handle (runtime only, not serialized) */
  handle?: FileSystemFileHandle

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
