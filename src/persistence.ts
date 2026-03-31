/**
 * IndexedDB persistence layer.
 * Stores the project directory handle and individual file handles.
 */

const DB_NAME = 'jungle-editor'
const DB_VERSION = 1
const PROJECT_STORE = 'project'
const HANDLES_STORE = 'handles'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE)
      }
      if (!db.objectStoreNames.contains(HANDLES_STORE)) {
        db.createObjectStore(HANDLES_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet<T>(store: IDBObjectStore, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(store: IDBObjectStore, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(store: IDBObjectStore, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ── Project directory handle ──

export async function saveProjectHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(PROJECT_STORE, 'readwrite')
  await idbPut(tx.objectStore(PROJECT_STORE), 'dir', handle)
}

export async function loadProjectHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDB()
  const tx = db.transaction(PROJECT_STORE, 'readonly')
  return idbGet<FileSystemDirectoryHandle>(tx.objectStore(PROJECT_STORE), 'dir')
}

// ── File handles ──

export async function saveFileHandle(sourceId: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(HANDLES_STORE, 'readwrite')
  await idbPut(tx.objectStore(HANDLES_STORE), sourceId, handle)
}

export async function loadFileHandle(sourceId: string): Promise<FileSystemFileHandle | undefined> {
  const db = await openDB()
  const tx = db.transaction(HANDLES_STORE, 'readonly')
  return idbGet<FileSystemFileHandle>(tx.objectStore(HANDLES_STORE), sourceId)
}

export async function removeFileHandle(sourceId: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(HANDLES_STORE, 'readwrite')
  await idbDelete(tx.objectStore(HANDLES_STORE), sourceId)
}

export async function loadAllFileHandles(): Promise<Map<string, FileSystemFileHandle>> {
  const db = await openDB()
  const tx = db.transaction(HANDLES_STORE, 'readonly')
  const store = tx.objectStore(HANDLES_STORE)

  return new Promise((resolve, reject) => {
    const map = new Map<string, FileSystemFileHandle>()
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        map.set(cursor.key as string, cursor.value as FileSystemFileHandle)
        cursor.continue()
      } else {
        resolve(map)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

// ── Clear all ──

export async function clearAll(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction([PROJECT_STORE, HANDLES_STORE], 'readwrite')
  tx.objectStore(PROJECT_STORE).clear()
  tx.objectStore(HANDLES_STORE).clear()
}
