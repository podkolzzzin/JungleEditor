/**
 * IndexedDB persistence for render job metadata.
 * Stores RenderJob objects for resume/recovery after tab close or crash.
 */

import type { RenderJob } from '../core/types'

const DB_NAME = 'jungle-render'
const DB_VERSION = 1
const STORE_NAME = 'render-jobs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveRenderJob(job: RenderJob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(job)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadRenderJob(id: string): Promise<RenderJob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function listRenderJobs(): Promise<RenderJob[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result ?? [])
    request.onerror = () => reject(request.error)
  })
}

export async function deleteRenderJob(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Check for render jobs that were interrupted (running/pending segments).
 * Resets interrupted segments to pending for resumption.
 */
export async function checkForResumableJobs(): Promise<RenderJob[]> {
  const allJobs = await listRenderJobs()
  const resumable: RenderJob[] = []

  for (const job of allJobs) {
    if (job.status === 'running' || job.status === 'paused') {
      // Reset any rendering segments back to pending
      for (const seg of job.segments) {
        if (seg.status === 'rendering') {
          seg.status = 'pending'
        }
      }
      job.status = 'paused'
      job.updatedAt = new Date().toISOString()
      await saveRenderJob(job)
      resumable.push(job)
    }
  }

  return resumable
}
