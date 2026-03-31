import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { Clip, MediaItem, Track, ProjectSettings } from '@/core/types'

const defaultSettings: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  sampleRate: 48000,
}

export const useProjectStore = defineStore('project', () => {
  // ── State ────────────────────────────────────────────────────────
  const name = ref('Untitled Project')
  const settings = reactive<ProjectSettings>({ ...defaultSettings })
  const tracks = ref<Track[]>([])
  const mediaItems = ref<MediaItem[]>([])
  const currentTime = ref(0)
  const isPlaying = ref(false)
  const selectedClipId = ref<string | null>(null)
  const activeTool = ref<'select' | 'cut'>('select')

  // ── Export state ─────────────────────────────────────────────────
  const exportDialogOpen = ref(false)
  const exportProgress = ref(0)
  const exportStatus = ref<'idle' | 'exporting' | 'done' | 'error'>('idle')

  // ── Getters ──────────────────────────────────────────────────────

  const allClips = computed(() => tracks.value.flatMap((t) => t.clips))

  const selectedClip = computed(() =>
    allClips.value.find((c) => c.id === selectedClipId.value) ?? null,
  )

  // ── Actions ──────────────────────────────────────────────────────

  function addTrack(type: 'video' | 'audio') {
    const id = crypto.randomUUID()
    tracks.value.push({
      id,
      name: `${type === 'video' ? 'Video' : 'Audio'} ${tracks.value.length + 1}`,
      type,
      muted: false,
      locked: false,
      clips: [],
    })
    return id
  }

  function removeTrack(trackId: string) {
    tracks.value = tracks.value.filter((t) => t.id !== trackId)
  }

  async function importMediaFiles(files: File[]) {
    for (const file of files) {
      const type = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'image'

      const item: MediaItem = {
        id: crypto.randomUUID(),
        name: file.name,
        type: type as MediaItem['type'],
        src: URL.createObjectURL(file),
        duration: 0,
        width: 0,
        height: 0,
        mimeType: file.type,
        fileSize: file.size,
      }

      // Probe duration / dimensions
      if (type === 'video' || type === 'audio') {
        const el = document.createElement(type === 'video' ? 'video' : 'audio')
        el.src = item.src
        el.preload = 'metadata'
        await new Promise<void>((resolve) => {
          el.onloadedmetadata = () => {
            item.duration = el.duration
            if (type === 'video' && el instanceof HTMLVideoElement) {
              item.width = el.videoWidth
              item.height = el.videoHeight
            }
            resolve()
          }
          el.onerror = () => resolve()
        })
      } else if (type === 'image') {
        const img = new Image()
        img.src = item.src
        await new Promise<void>((resolve) => {
          img.onload = () => {
            item.width = img.naturalWidth
            item.height = img.naturalHeight
            resolve()
          }
          img.onerror = () => resolve()
        })
      }

      mediaItems.value.push(item)
    }
  }

  /**
   * Add a media item to the timeline as a clip.
   * Creates a track if none exist for the media type, then appends the clip.
   */
  function addToTimeline(mediaId: string) {
    const media = mediaItems.value.find((m) => m.id === mediaId)
    if (!media) return null

    const trackType = media.type === 'audio' ? 'audio' : 'video'

    // Find or create a track
    let track = tracks.value.find((t) => t.type === trackType)
    if (!track) {
      const trackId = addTrack(trackType)
      track = tracks.value.find((t) => t.id === trackId)!
    }

    // Place clip at the end of existing clips
    const lastEnd = track.clips.reduce(
      (max, c) => Math.max(max, c.startTime + c.duration),
      0,
    )

    const clip: Clip = {
      id: crypto.randomUUID(),
      mediaId: media.id,
      trackId: track.id,
      startTime: lastEnd,
      duration: media.duration || 5, // 5s default for images
      sourceOffset: 0,
      speed: 1,
    }

    track.clips.push(clip)
    selectedClipId.value = clip.id
    return clip.id
  }

  /**
   * Split (cut) a clip at the given timeline position.
   * Returns the IDs of the two resulting clips, or null if invalid.
   */
  function splitClip(clipId: string, atTime: number): [string, string] | null {
    for (const track of tracks.value) {
      const idx = track.clips.findIndex((c) => c.id === clipId)
      if (idx === -1) continue

      const clip = track.clips[idx]
      const relativeTime = atTime - clip.startTime

      // Can't split at the very start or end
      if (relativeTime <= 0.01 || relativeTime >= clip.duration - 0.01) {
        return null
      }

      const leftDuration = relativeTime
      const rightDuration = clip.duration - relativeTime

      // Modify existing clip to become the left part
      clip.duration = leftDuration

      // Create right part
      const rightClip: Clip = {
        id: crypto.randomUUID(),
        mediaId: clip.mediaId,
        trackId: track.id,
        startTime: clip.startTime + leftDuration,
        duration: rightDuration,
        sourceOffset: clip.sourceOffset + leftDuration / clip.speed,
        speed: clip.speed,
      }

      track.clips.splice(idx + 1, 0, rightClip)
      return [clip.id, rightClip.id]
    }

    return null
  }

  /**
   * Split the currently selected clip at the playhead position.
   * If no clip is selected, finds the clip under the playhead.
   */
  function splitAtPlayhead(): [string, string] | null {
    let clipId = selectedClipId.value

    // If no clip selected, find the clip under the playhead
    if (!clipId) {
      const time = currentTime.value
      for (const track of tracks.value) {
        const clip = track.clips.find(
          (c) => c.startTime <= time && c.startTime + c.duration >= time,
        )
        if (clip) {
          clipId = clip.id
          break
        }
      }
    }

    if (!clipId) return null
    return splitClip(clipId, currentTime.value)
  }

  function setCurrentTime(time: number) {
    currentTime.value = Math.max(0, time)
  }

  function togglePlayback() {
    isPlaying.value = !isPlaying.value
  }

  function selectClip(clipId: string | null) {
    selectedClipId.value = clipId
  }

  function setActiveTool(tool: 'select' | 'cut') {
    activeTool.value = tool
  }

  function openExportDialog() {
    exportDialogOpen.value = true
    exportStatus.value = 'idle'
    exportProgress.value = 0
  }

  function closeExportDialog() {
    exportDialogOpen.value = false
  }

  /**
   * Simulate an export process.
   * In the real implementation this would use the ExportPipeline engine.
   */
  async function startExport(): Promise<void> {
    exportStatus.value = 'exporting'
    exportProgress.value = 0

    // Simulate progress
    const totalSteps = 20
    for (let i = 1; i <= totalSteps; i++) {
      await new Promise((r) => setTimeout(r, 100))
      exportProgress.value = Math.round((i / totalSteps) * 100)
    }

    exportStatus.value = 'done'
  }

  return {
    name,
    settings,
    tracks,
    mediaItems,
    currentTime,
    isPlaying,
    selectedClipId,
    selectedClip,
    allClips,
    activeTool,
    exportDialogOpen,
    exportProgress,
    exportStatus,
    addTrack,
    removeTrack,
    importMediaFiles,
    addToTimeline,
    splitClip,
    splitAtPlayhead,
    setCurrentTime,
    togglePlayback,
    selectClip,
    setActiveTool,
    openExportDialog,
    closeExportDialog,
    startExport,
  }
})
