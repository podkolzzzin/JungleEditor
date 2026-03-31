/**
 * Persistence layer — all data lives on disk in the project's sources/ folder.
 * No IndexedDB or localStorage is used.
 *
 * File handles are kept in-memory only for the current session.
 * When the user re-opens a project after a reload, the file tree is rebuilt
 * from .source metadata files.  Files appear "unlinked" (no handle) and can
 * be re-linked via the "Re-link Sources" action or by clicking individual files.
 */

// ── In-memory handle cache (session-only) ──

const handleCache = new Map<string, FileSystemFileHandle>()

export function saveFileHandle(sourceId: string, handle: FileSystemFileHandle): void {
  handleCache.set(sourceId, handle)
}

export function loadFileHandle(sourceId: string): FileSystemFileHandle | undefined {
  return handleCache.get(sourceId)
}

export function removeFileHandle(sourceId: string): void {
  handleCache.delete(sourceId)
}

export function loadAllFileHandles(): Map<string, FileSystemFileHandle> {
  return new Map(handleCache)
}

export function clearAll(): void {
  handleCache.clear()
}
