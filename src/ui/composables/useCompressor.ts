/**
 * useCompressor — Vue composable
 *
 * Manages the lifecycle of the compressor Web Worker, exposes reactive
 * status/progress, and provides `compress()` and `cancel()` actions.
 */

import { ref, shallowRef } from 'vue'
import type { CompressProgress, CompressSettings, CompressStatus } from '../../core/types'
import CompressorWorker from '../workers/compressor.worker?worker'

export function useCompressor() {
  const status = ref<CompressStatus>('idle')
  const progress = ref<CompressProgress>({ percent: 0, fps: 0, etaSeconds: 0 })
  const errorMessage = ref('')
  const worker = shallowRef<Worker | null>(null)

  /** Check whether a codec is hardware-accelerated (soft warning only). */
  async function checkCodecSupport(codec: string): Promise<boolean> {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width: 1280,
        height: 720,
        bitrate: 4_000_000,
      })
      return result.supported ?? false
    } catch {
      return false
    }
  }

  /**
   * Start compression.
   *
   * @param file           Source video File object.
   * @param settings       Compression settings.
   * @param outputHandle   FSA file handle to write into.
   */
  function compress(
    file: File,
    settings: CompressSettings,
    outputHandle: FileSystemFileHandle,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      status.value = 'encoding'
      progress.value = { percent: 0, fps: 0, etaSeconds: 0 }
      errorMessage.value = ''

      const w = new CompressorWorker()
      worker.value = w

      w.onmessage = async (ev: MessageEvent) => {
        const msg = ev.data as
          | { type: 'progress'; percent: number; fps: number; etaSeconds: number }
          | { type: 'done' }
          | { type: 'error'; message: string }

        if (msg.type === 'progress') {
          progress.value = {
            percent: msg.percent,
            fps: msg.fps,
            etaSeconds: msg.etaSeconds,
          }
        } else if (msg.type === 'done') {
          status.value = 'done'
          progress.value = { percent: 100, fps: 0, etaSeconds: 0 }
          w.terminate()
          worker.value = null
          resolve()
        } else if (msg.type === 'error') {
          status.value = 'error'
          errorMessage.value = msg.message
          w.terminate()
          worker.value = null
          reject(new Error(msg.message))
        }
      }

      w.onerror = (err) => {
        status.value = 'error'
        errorMessage.value = err.message
        worker.value = null
        reject(err)
      }

      // Open a writable stream and hand it to the worker
      outputHandle.createWritable().then((writable) => {
        w.postMessage({ type: 'start', file, settings, writable }, [writable as unknown as Transferable])
      }).catch((err: unknown) => {
        status.value = 'error'
        errorMessage.value = (err as Error)?.message ?? String(err)
        w.terminate()
        worker.value = null
        reject(err)
      })
    })
  }

  /** Cancel in-progress compression. */
  function cancel() {
    if (worker.value) {
      worker.value.postMessage({ type: 'cancel' })
      worker.value.terminate()
      worker.value = null
    }
    status.value = 'cancelled'
  }

  return { status, progress, errorMessage, compress, cancel, checkCodecSupport }
}
