/**
 * OPFS (Origin Private File System) storage for rendered segment binary data.
 * Segments are stored as files under jungle-renders/{jobId}/segment-NNNN.fmp4
 */

const RENDER_ROOT = 'jungle-renders'

async function getRenderRoot(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(RENDER_ROOT, { create: true })
}

async function getJobDir(jobId: string): Promise<FileSystemDirectoryHandle> {
  const renderRoot = await getRenderRoot()
  return renderRoot.getDirectoryHandle(jobId, { create: true })
}

/**
 * Write a rendered segment file to OPFS.
 */
export async function writeSegmentFile(
  jobId: string,
  segmentIndex: number,
  data: Uint8Array,
): Promise<string> {
  const dir = await getJobDir(jobId)
  const filename = `segment-${String(segmentIndex).padStart(4, '0')}.fmp4`
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
  return `${RENDER_ROOT}/${jobId}/${filename}`
}

/**
 * Read a rendered segment file from OPFS.
 */
export async function readSegmentFile(
  jobId: string,
  segmentIndex: number,
): Promise<Uint8Array | null> {
  try {
    const dir = await getJobDir(jobId)
    const filename = `segment-${String(segmentIndex).padStart(4, '0')}.fmp4`
    const fileHandle = await dir.getFileHandle(filename)
    const file = await fileHandle.getFile()
    const buffer = await file.arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

/**
 * Delete all segment files for a render job.
 */
export async function deleteJobFiles(jobId: string): Promise<void> {
  try {
    const renderRoot = await getRenderRoot()
    await renderRoot.removeEntry(jobId, { recursive: true })
  } catch {
    // Directory may not exist
  }
}

/**
 * Get an estimate of storage usage.
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    }
  }
  return { usage: 0, quota: 0 }
}
