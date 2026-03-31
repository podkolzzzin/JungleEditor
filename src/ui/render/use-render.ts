/**
 * Render orchestrator composable.
 * Manages the render pipeline: segmenting, fingerprinting, worker spawning,
 * progress tracking, and output file writing.
 */

import { ref, computed } from 'vue'
import type { TimelineDocument, RenderProfile, RenderJob, RenderTask } from '../../core/types'
import { computeSegments } from '../../core/render/segmenter'
import { buildFingerprintInput, computeFingerprint } from '../../core/render/fingerprint'
import { addTask, updateTask, removeTask, backgroundTasks } from '../store'
import { saveRenderJob, loadRenderJob, deleteRenderJob, checkForResumableJobs } from '../render-store'
import { writeSegmentFile, deleteJobFiles } from '../render-opfs'
import type { RenderWorkerOutput } from './render-worker'

export function useRender() {
  const isRendering = ref(false)
  const progress = ref(0)
  const currentJobId = ref<string | null>(null)
  let worker: Worker | null = null

  const activeRenderTask = computed(() =>
    backgroundTasks.find((t): t is RenderTask => t.type === 'render' && t.status === 'running'),
  )

  /**
   * Start rendering a timeline with the given profile.
   */
  async function startRender(
    doc: TimelineDocument,
    profile: RenderProfile,
    sources: Record<string, ArrayBuffer>,
  ): Promise<void> {
    if (isRendering.value) return

    const jobId = crypto.randomUUID()
    currentJobId.value = jobId
    isRendering.value = true
    progress.value = 0

    // Compute segments and fingerprints
    const segments = computeSegments(doc)
    const segmentMetas = await Promise.all(
      segments.map(async (seg, i) => {
        const fpInput = buildFingerprintInput(seg, profile)
        const fingerprint = await computeFingerprint(fpInput)
        return {
          index: i,
          startTime: seg.startTime,
          endTime: seg.endTime,
          duration: seg.duration,
          fingerprint,
          status: 'pending' as const,
          framesRendered: 0,
          totalFrames: Math.ceil(seg.duration * profile.fps),
          opfsPath: '',
        }
      }),
    )

    // Create render job
    const job: RenderJob = {
      id: jobId,
      timelineName: doc.name,
      status: 'running',
      profile,
      timelineSnapshot: doc,
      segments: segmentMetas,
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await saveRenderJob(job)

    // Create background task
    const task: RenderTask = {
      id: `task-${jobId}`,
      type: 'render',
      label: `Rendering ${doc.name}`,
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
      canPause: true,
      canCancel: true,
      renderJobId: jobId,
      timelineName: doc.name,
      profileName: profile.name,
      currentSegment: 0,
      totalSegments: segments.length,
    }
    addTask(task)

    // Spawn worker
    worker = new Worker(new URL('./render-worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = async (event: MessageEvent<RenderWorkerOutput>) => {
      const msg = event.data

      switch (msg.type) {
        case 'progress': {
          const segProgress = msg.framesRendered / msg.totalFrames
          const overallProgress = (msg.segment + segProgress) / msg.total
          progress.value = overallProgress
          updateTask(`task-${jobId}`, {
            progress: overallProgress,
            ...(msg as any).segment !== undefined ? { currentSegment: msg.segment } : {},
          })
          break
        }

        case 'segment-complete': {
          // Store segment data in OPFS
          const opfsPath = await writeSegmentFile(jobId, msg.segment, msg.data)

          // Update job metadata
          const loadedJob = await loadRenderJob(jobId)
          if (loadedJob && loadedJob.segments[msg.segment]) {
            loadedJob.segments[msg.segment].status = 'complete'
            loadedJob.segments[msg.segment].opfsPath = opfsPath
            loadedJob.segments[msg.segment].fileSize = msg.data.length
            loadedJob.updatedAt = new Date().toISOString()
            await saveRenderJob(loadedJob)
          }
          break
        }

        case 'complete': {
          isRendering.value = false
          progress.value = 1

          const loadedJob = await loadRenderJob(jobId)
          if (loadedJob) {
            loadedJob.status = 'complete'
            loadedJob.progress = 1
            loadedJob.updatedAt = new Date().toISOString()
            await saveRenderJob(loadedJob)
          }

          updateTask(`task-${jobId}`, {
            status: 'complete',
            progress: 1,
            completedAt: new Date().toISOString(),
          })

          worker?.terminate()
          worker = null
          currentJobId.value = null
          break
        }

        case 'error': {
          console.error('Render error:', msg.message)
          isRendering.value = false

          const loadedJob = await loadRenderJob(jobId)
          if (loadedJob) {
            loadedJob.status = 'failed'
            loadedJob.updatedAt = new Date().toISOString()
            await saveRenderJob(loadedJob)
          }

          updateTask(`task-${jobId}`, {
            status: 'failed',
            error: msg.message,
          })

          worker?.terminate()
          worker = null
          currentJobId.value = null
          break
        }
      }
    }

    worker.onerror = (err) => {
      console.error('Worker error:', err)
      isRendering.value = false
      updateTask(`task-${jobId}`, { status: 'failed', error: 'Worker crashed' })
      worker = null
      currentJobId.value = null
    }

    // Start the render
    worker.postMessage({
      type: 'start',
      doc,
      profile,
      sources,
    })
  }

  /**
   * Cancel the current render.
   */
  async function cancelRender(): Promise<void> {
    if (!worker || !currentJobId.value) return

    worker.postMessage({ type: 'cancel' })
    worker.terminate()
    worker = null
    isRendering.value = false
    progress.value = 0

    const jobId = currentJobId.value
    const job = await loadRenderJob(jobId)
    if (job) {
      job.status = 'cancelled'
      job.updatedAt = new Date().toISOString()
      await saveRenderJob(job)
    }

    updateTask(`task-${jobId}`, { status: 'failed', error: 'Cancelled by user' })
    currentJobId.value = null
  }

  /**
   * Pause the current render (terminates worker; resume re-creates it).
   */
  async function pauseRender(): Promise<void> {
    if (!worker || !currentJobId.value) return

    worker.postMessage({ type: 'cancel' })
    worker.terminate()
    worker = null
    isRendering.value = false

    const jobId = currentJobId.value
    const job = await loadRenderJob(jobId)
    if (job) {
      job.status = 'paused'
      job.updatedAt = new Date().toISOString()
      await saveRenderJob(job)
    }

    updateTask(`task-${jobId}`, { status: 'paused' })
  }

  /**
   * Clean up a completed or failed render job.
   */
  async function cleanupJob(jobId: string): Promise<void> {
    await deleteJobFiles(jobId)
    await deleteRenderJob(jobId)
    removeTask(`task-${jobId}`)
  }

  return {
    isRendering,
    progress,
    activeRenderTask,
    startRender,
    cancelRender,
    pauseRender,
    cleanupJob,
    checkForResumableJobs,
  }
}
