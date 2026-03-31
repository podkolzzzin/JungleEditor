import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { MediaItem, Track, ProjectSettings } from '@/core/types'

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

  function setCurrentTime(time: number) {
    currentTime.value = Math.max(0, time)
  }

  function togglePlayback() {
    isPlaying.value = !isPlaying.value
  }

  function selectClip(clipId: string | null) {
    selectedClipId.value = clipId
  }

  return {
    name,
    settings,
    tracks,
    mediaItems,
    currentTime,
    isPlaying,
    selectedClipId,
    addTrack,
    removeTrack,
    importMediaFiles,
    setCurrentTime,
    togglePlayback,
    selectClip,
  }
})
