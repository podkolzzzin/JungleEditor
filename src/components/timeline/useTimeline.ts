import { computed, ref, watch, nextTick } from 'vue'
import type { TimelineClip, TimelineTrack } from '../../types'
import {
  activeFile,
  activeTimeline,
  saveTimeline,
} from '../../store'
import { getClipSpeed, getClipEffectiveDuration } from './compositor'

// ── Constants ──

export const MIN_PPS = 4
export const MAX_PPS = 200
export const DEFAULT_PPS = 20
export const DEFAULT_CLIP_DURATION = 10
export const TRACK_COLORS = ['#e06c75', '#e5c07b', '#98c379', '#56b6c2', '#c678dd', '#d19a66', '#61afef']

// ── Formatting helpers ──

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${f}`
}

export function formatTimeFull(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

export function parseTimeInput(value: string): number {
  const parts = value.split(':')
  if (parts.length >= 2) {
    const last = parts.pop()!
    const [s, ms] = last.split('.')
    let total = Number(s) + Number(ms || 0) / (last.includes('.') ? Math.pow(10, (ms || '').length) : 1)
    const mins = Number(parts.pop() || 0)
    const hrs = Number(parts.pop() || 0)
    return hrs * 3600 + mins * 60 + total
  }
  return Number(value) || 0
}

export function trackColor(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length]
}

// ── Composable ──

export type TrimEdge = 'left' | 'right'

export interface ClipSelection {
  trackIndex: number
  clipIndex: number
}

export function useTimeline() {
  // ── Core state ──
  const doc = computed(() => activeTimeline.value)
  const dirty = ref(false)
  const selectedClip = ref<ClipSelection | null>(null)
  const dragOverTrack = ref<number | null>(null)
  const dragOverNewTrack = ref(false)

  // Global playhead — drives the player and timeline position indicator
  const globalPlayhead = ref(0)
  const isPlaying = ref(false)

  // Zoom
  const pixelsPerSecond = ref(DEFAULT_PPS)
  const tracksScrollEl = ref<HTMLElement | null>(null)

  // Clip drag
  const clipDrag = ref<{
    trackIndex: number; clipIndex: number
    startX: number; startY: number; startOffset: number
  } | null>(null)
  const clipDragTargetTrack = ref<number | null>(null)

  // Edge trim
  const edgeDrag = ref<{
    trackIndex: number; clipIndex: number; edge: TrimEdge
    startX: number; startIn: number; startOut: number; startOffset: number
  } | null>(null)

  // Track reorder drag
  const trackDrag = ref<{
    trackIndex: number
    startY: number
  } | null>(null)
  const trackDragOverIndex = ref<number | null>(null)

  // ── Watchers ──
  watch(() => activeTimeline.value, () => {
    dirty.value = false
    selectedClip.value = null
    globalPlayhead.value = 0
    isPlaying.value = false
  })

  function markDirty() {
    dirty.value = true
  }

  // ── Layout helpers ──

  function clipWidth(clip: TimelineClip): number {
    return Math.max(40, getClipEffectiveDuration(clip) * pixelsPerSecond.value)
  }

  function clipOffsetPx(clip: TimelineClip): number {
    return (clip.offset ?? 0) * pixelsPerSecond.value
  }

  function totalDuration(): number {
    if (!doc.value) return 0
    let max = 0
    for (const track of doc.value.tracks) {
      for (const clip of track.clips) {
        const end = (clip.offset ?? 0) + getClipEffectiveDuration(clip)
        if (end > max) max = end
      }
    }
    return max
  }

  function timelineWidth(): number {
    return Math.max(600, totalDuration() * pixelsPerSecond.value + 200)
  }

  // ── Ruler ──

  function rulerMarks(): { pos: number; label: string }[] {
    const marks: { pos: number; label: string }[] = []
    const width = timelineWidth()
    const pps = pixelsPerSecond.value
    let step: number
    if (pps >= 80) step = 1
    else if (pps >= 30) step = 2
    else if (pps >= 15) step = 5
    else if (pps >= 6) step = 10
    else step = 30
    for (let t = 0; t * pps <= width; t += step) {
      marks.push({ pos: t * pps, label: formatTime(t) })
    }
    return marks
  }

  // ── Track operations ──

  function addTrack() {
    if (!doc.value) return
    doc.value.tracks.push({ name: `Track ${doc.value.tracks.length + 1}`, clips: [] })
    markDirty()
  }

  function removeTrack(index: number) {
    if (!doc.value) return
    doc.value.tracks.splice(index, 1)
    if (selectedClip.value?.trackIndex === index) selectedClip.value = null
    markDirty()
  }

  // ── Clip operations ──

  function removeClip(trackIndex: number, clipIndex: number) {
    if (!doc.value) return
    doc.value.tracks[trackIndex].clips.splice(clipIndex, 1)
    if (selectedClip.value?.trackIndex === trackIndex && selectedClip.value?.clipIndex === clipIndex) {
      selectedClip.value = null
    }
    markDirty()
  }

  function selectClip(trackIndex: number, clipIndex: number) {
    if (!doc.value) return
    selectedClip.value = { trackIndex, clipIndex }
    const clip = doc.value.tracks[trackIndex].clips[clipIndex]
    // Jump playhead to clip start so the player shows this clip
    globalPlayhead.value = clip.offset ?? 0
  }

  // ── Drag & Drop (from file tree) ──

  function extractClipData(e: DragEvent): { sourceId: string; sourceName: string } | null {
    const data = e.dataTransfer?.getData('application/x-jungle-clip')
    if (!data) return null
    try { return JSON.parse(data) } catch { return null }
  }

  function onTrackDragOver(e: DragEvent, trackIndex: number) {
    if (e.dataTransfer?.types.includes('application/x-jungle-clip')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      dragOverTrack.value = trackIndex
    }
  }

  function onTrackDragLeave(_e: DragEvent, trackIndex: number) {
    if (dragOverTrack.value === trackIndex) dragOverTrack.value = null
  }

  function onTrackDrop(e: DragEvent, trackIndex: number) {
    e.preventDefault()
    dragOverTrack.value = null
    const data = extractClipData(e)
    if (!data || !doc.value) return

    const clipsArea = (e.currentTarget as HTMLElement).querySelector('.track-clips-area') as HTMLElement | null
    let dropOffset = 0
    if (clipsArea) {
      const rect = clipsArea.getBoundingClientRect()
      dropOffset = Math.max(0, (e.clientX - rect.left + clipsArea.scrollLeft) / pixelsPerSecond.value)
    }

    const clip: TimelineClip = {
      sourceId: data.sourceId,
      sourceName: data.sourceName,
      in: 0,
      out: DEFAULT_CLIP_DURATION,
      offset: Math.round(dropOffset * 10) / 10,
      operations: [],
    }
    doc.value.tracks[trackIndex].clips.push(clip)
    markDirty()
    selectClip(trackIndex, doc.value.tracks[trackIndex].clips.length - 1)
  }

  function onNewTrackDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes('application/x-jungle-clip')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      dragOverNewTrack.value = true
    }
  }

  function onNewTrackDragLeave() {
    dragOverNewTrack.value = false
  }

  function onNewTrackDrop(e: DragEvent) {
    e.preventDefault()
    dragOverNewTrack.value = false
    const data = extractClipData(e)
    if (!data || !doc.value) return

    const track: TimelineTrack = {
      name: `Track ${doc.value.tracks.length + 1}`,
      clips: [{
        sourceId: data.sourceId,
        sourceName: data.sourceName,
        in: 0,
        out: DEFAULT_CLIP_DURATION,
        offset: 0,
        operations: [],
      }],
    }
    doc.value.tracks.push(track)
    markDirty()
    selectClip(doc.value.tracks.length - 1, 0)
  }

  // ── Zoom ──

  function zoomIn() {
    pixelsPerSecond.value = Math.min(MAX_PPS, Math.round(pixelsPerSecond.value * 1.4))
  }

  function zoomOut() {
    pixelsPerSecond.value = Math.max(MIN_PPS, Math.round(pixelsPerSecond.value / 1.4))
  }

  function zoomReset() {
    pixelsPerSecond.value = DEFAULT_PPS
  }

  function onTimelineWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const scrollEl = tracksScrollEl.value
      const rect = scrollEl?.getBoundingClientRect()
      const cursorX = rect ? e.clientX - rect.left : 0
      const scrollLeft = scrollEl?.scrollLeft ?? 0
      const timeAtCursor = (scrollLeft + cursorX - 140) / pixelsPerSecond.value

      if (e.deltaY < 0) {
        pixelsPerSecond.value = Math.min(MAX_PPS, Math.round(pixelsPerSecond.value * 1.15))
      } else {
        pixelsPerSecond.value = Math.max(MIN_PPS, Math.round(pixelsPerSecond.value / 1.15))
      }

      if (scrollEl) {
        nextTick(() => {
          scrollEl.scrollLeft = timeAtCursor * pixelsPerSecond.value - cursorX + 140
        })
      }
    }
  }

  // ── Clip drag to reposition ──

  function onClipMouseDown(e: MouseEvent, trackIndex: number, clipIndex: number) {
    if (e.button !== 0) return
    if (!doc.value) return
    const clip = doc.value.tracks[trackIndex].clips[clipIndex]
    clipDrag.value = {
      trackIndex, clipIndex,
      startX: e.clientX, startY: e.clientY,
      startOffset: clip.offset ?? 0,
    }
    clipDragTargetTrack.value = trackIndex
    e.preventDefault()
    window.addEventListener('mousemove', onClipMouseMove)
    window.addEventListener('mouseup', onClipMouseUp)
  }

  function getTrackIndexAtY(clientY: number): number | null {
    if (!tracksScrollEl.value || !doc.value) return null
    const lanes = tracksScrollEl.value.querySelectorAll('.track-lane')
    for (let i = 0; i < lanes.length; i++) {
      const rect = lanes[i].getBoundingClientRect()
      if (clientY >= rect.top && clientY < rect.bottom) return i
    }
    return null
  }

  function onClipMouseMove(e: MouseEvent) {
    if (!clipDrag.value || !doc.value) return
    const { trackIndex, clipIndex, startX, startOffset } = clipDrag.value
    const dx = e.clientX - startX
    const dtSeconds = dx / pixelsPerSecond.value
    const newOffset = Math.max(0, Math.round((startOffset + dtSeconds) * 10) / 10)
    const clip = doc.value.tracks[trackIndex]?.clips[clipIndex]
    if (clip) clip.offset = newOffset
    const hoverTrack = getTrackIndexAtY(e.clientY)
    clipDragTargetTrack.value = hoverTrack ?? trackIndex
  }

  function onClipMouseUp() {
    if (clipDrag.value && doc.value) {
      const { trackIndex, clipIndex } = clipDrag.value
      const targetTi = clipDragTargetTrack.value
      if (targetTi !== null && targetTi !== trackIndex && targetTi < doc.value.tracks.length) {
        const [clip] = doc.value.tracks[trackIndex].clips.splice(clipIndex, 1)
        doc.value.tracks[targetTi].clips.push(clip)
        selectedClip.value = { trackIndex: targetTi, clipIndex: doc.value.tracks[targetTi].clips.length - 1 }
      }
      markDirty()
    }
    clipDrag.value = null
    clipDragTargetTrack.value = null
    window.removeEventListener('mousemove', onClipMouseMove)
    window.removeEventListener('mouseup', onClipMouseUp)
  }

  // ── Split clip ──

  function splitClip(trackIndex: number, clipIndex: number, atSourceTime?: number) {
    if (!doc.value) return
    const track = doc.value.tracks[trackIndex]
    if (!track) return
    const clip = track.clips[clipIndex]
    if (!clip) return

    const duration = clip.out - clip.in
    if (duration < 0.2) return

    const splitPoint = atSourceTime ?? clip.in + duration / 2
    if (splitPoint <= clip.in + 0.05 || splitPoint >= clip.out - 0.05) return

    const speed = getClipSpeed(clip)
    const rightClip: TimelineClip = {
      sourceId: clip.sourceId,
      sourceName: clip.sourceName,
      in: splitPoint,
      out: clip.out,
      offset: (clip.offset ?? 0) + (splitPoint - clip.in) / speed,
      operations: clip.operations ? clip.operations.filter(op => op.type !== 'fade_in').map(op => ({ ...op })) : [],
    }

    // Left clip keeps fade_in, loses fade_out
    if (clip.operations) {
      clip.operations = clip.operations.filter(op => op.type !== 'fade_out').map(op => ({ ...op }))
    }

    clip.out = splitPoint
    track.clips.splice(clipIndex + 1, 0, rightClip)
    selectedClip.value = { trackIndex, clipIndex }
    markDirty()
  }

  /** Split all clips at the global playhead position (blade cut across all tracks) */
  function splitAtPlayhead() {
    if (!doc.value) return
    const t = globalPlayhead.value
    let didSplit = false

    // Iterate in reverse to handle index shifts from splicing
    for (let ti = doc.value.tracks.length - 1; ti >= 0; ti--) {
      const track = doc.value.tracks[ti]
      for (let ci = track.clips.length - 1; ci >= 0; ci--) {
        const clip = track.clips[ci]
        const clipStart = clip.offset ?? 0
        const speed = getClipSpeed(clip)
        const effectiveDuration = getClipEffectiveDuration(clip)
        const clipEnd = clipStart + effectiveDuration

        if (t > clipStart + 0.05 && t < clipEnd - 0.05) {
          // Compute the source time at the playhead position
          const sourceTime = clip.in + (t - clipStart) * speed
          splitClip(ti, ci, sourceTime)
          didSplit = true
        }
      }
    }

    return didSplit
  }

  // ── Playback controls ──

  function togglePlay() {
    isPlaying.value = !isPlaying.value
  }

  function seekTo(time: number) {
    globalPlayhead.value = Math.max(0, Math.min(time, totalDuration()))
  }

  // ── Edge trim handles ──

  function onEdgeMouseDown(e: MouseEvent, trackIndex: number, clipIndex: number, edge: TrimEdge) {
    if (e.button !== 0) return
    if (!doc.value) return
    const clip = doc.value.tracks[trackIndex].clips[clipIndex]
    edgeDrag.value = {
      trackIndex, clipIndex, edge,
      startX: e.clientX,
      startIn: clip.in, startOut: clip.out,
      startOffset: clip.offset ?? 0,
    }
    e.preventDefault()
    e.stopPropagation()
    window.addEventListener('mousemove', onEdgeMouseMove)
    window.addEventListener('mouseup', onEdgeMouseUp)
  }

  function onEdgeMouseMove(e: MouseEvent) {
    if (!edgeDrag.value || !doc.value) return
    const { trackIndex, clipIndex, edge, startX, startIn, startOut, startOffset } = edgeDrag.value
    const clip = doc.value.tracks[trackIndex]?.clips[clipIndex]
    if (!clip) return

    const dx = e.clientX - startX
    const dt = dx / pixelsPerSecond.value
    const MIN_DURATION = 0.1

    if (edge === 'left') {
      let newIn = startIn + dt
      newIn = Math.max(0, newIn)
      newIn = Math.min(startOut - MIN_DURATION, newIn)
      const inDelta = newIn - startIn
      clip.in = Math.round(newIn * 100) / 100
      clip.offset = Math.max(0, Math.round((startOffset + inDelta) * 100) / 100)
    } else {
      let newOut = startOut + dt
      newOut = Math.max(startIn + MIN_DURATION, newOut)
      clip.out = Math.round(newOut * 100) / 100
    }
  }

  function onEdgeMouseUp() {
    if (edgeDrag.value) markDirty()
    edgeDrag.value = null
    window.removeEventListener('mousemove', onEdgeMouseMove)
    window.removeEventListener('mouseup', onEdgeMouseUp)
  }

  // ── Track reorder drag ──

  function onTrackReorderStart(e: MouseEvent, trackIndex: number) {
    if (e.button !== 0) return
    if (!doc.value) return
    trackDrag.value = { trackIndex, startY: e.clientY }
    trackDragOverIndex.value = trackIndex
    e.preventDefault()
    window.addEventListener('mousemove', onTrackReorderMove)
    window.addEventListener('mouseup', onTrackReorderEnd)
  }

  function onTrackReorderMove(e: MouseEvent) {
    if (!trackDrag.value || !doc.value) return
    const hoverTrack = getTrackIndexAtY(e.clientY)
    if (hoverTrack !== null) {
      trackDragOverIndex.value = hoverTrack
    }
  }

  function onTrackReorderEnd() {
    if (trackDrag.value && doc.value && trackDragOverIndex.value !== null) {
      const from = trackDrag.value.trackIndex
      const to = trackDragOverIndex.value
      if (from !== to) {
        const [track] = doc.value.tracks.splice(from, 1)
        doc.value.tracks.splice(to, 0, track)

        // Adjust selectedClip to follow the moved track
        if (selectedClip.value) {
          const sel = selectedClip.value.trackIndex
          if (sel === from) {
            selectedClip.value = { ...selectedClip.value, trackIndex: to }
          } else if (from < to && sel > from && sel <= to) {
            selectedClip.value = { ...selectedClip.value, trackIndex: sel - 1 }
          } else if (from > to && sel >= to && sel < from) {
            selectedClip.value = { ...selectedClip.value, trackIndex: sel + 1 }
          }
        }

        markDirty()
      }
    }
    trackDrag.value = null
    trackDragOverIndex.value = null
    window.removeEventListener('mousemove', onTrackReorderMove)
    window.removeEventListener('mouseup', onTrackReorderEnd)
  }

  // ── Inspector ──

  const inspectedClip = computed(() => {
    if (!doc.value || !selectedClip.value) return null
    const { trackIndex, clipIndex } = selectedClip.value
    return doc.value.tracks[trackIndex]?.clips[clipIndex] ?? null
  })

  // ── Save ──

  async function onSave() {
    await saveTimeline()
    dirty.value = false
  }

  return {
    // Re-export store refs used in template
    activeFile,
    activeTimeline,

    // State
    doc,
    dirty,
    selectedClip,
    globalPlayhead,
    isPlaying,
    dragOverTrack,
    dragOverNewTrack,
    pixelsPerSecond,
    tracksScrollEl,
    clipDrag,
    clipDragTargetTrack,
    edgeDrag,
    trackDrag,
    trackDragOverIndex,

    // Helpers
    clipWidth,
    clipOffsetPx,
    totalDuration,
    timelineWidth,
    rulerMarks,

    // Actions
    markDirty,
    addTrack,
    removeTrack,
    removeClip,
    selectClip,

    // External drag & drop
    onTrackDragOver,
    onTrackDragLeave,
    onTrackDrop,
    onNewTrackDragOver,
    onNewTrackDragLeave,
    onNewTrackDrop,

    // Zoom
    zoomIn,
    zoomOut,
    zoomReset,
    onTimelineWheel,

    // Clip drag
    onClipMouseDown,

    // Split & Playback
    splitAtPlayhead,
    togglePlay,
    seekTo,

    // Edge trim
    onEdgeMouseDown,

    // Track reorder
    onTrackReorderStart,

    // Inspector
    inspectedClip,

    // Save
    onSave,
  }
}
