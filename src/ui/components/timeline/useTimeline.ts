import { computed, ref, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import type { TimelineClip, TimelineTrack } from '../../../core/types'
import {
  paneLayout,
  openTabs,
  focusedPaneId,
  findPaneById,
  setTabDirty,
  saveTimelineById,
  findNode,
  sourcesDir,
} from '../../store'
import { getClipEffectiveDuration } from '../../../core/timeline/clip-helpers'
import { splitAllAtPlayhead, computeTotalDuration } from '../../../core/timeline/operations'
import { MIN_PPS, MAX_PPS, DEFAULT_PPS, DEFAULT_CLIP_DURATION } from '../../../core/timeline/constants'
import { formatTime } from '../../../core/timeline/format'

// Re-export core constants and formatters for use by other timeline components
export { MIN_PPS, MAX_PPS, DEFAULT_PPS, DEFAULT_CLIP_DURATION, TRACK_COLORS, trackColor } from '../../../core/timeline/constants'
export { formatTime, formatTimeFull, parseTimeInput } from '../../../core/timeline/format'

// ── Composable ──

export type TrimEdge = 'left' | 'right'

export interface ClipSelection {
  trackIndex: number
  clipIndex: number
}

export function useTimeline(paneIdRef?: Ref<string>) {
  // ── Derive pane-specific state ──
  const paneId = computed(() => paneIdRef?.value ?? focusedPaneId.value)

  const activeTab = computed(() => {
    const pane = findPaneById(paneLayout.value, paneId.value)
    if (!pane || pane.type !== 'leaf' || !pane.activeTabId) return null
    return openTabs.get(pane.activeTabId) ?? null
  })

  const doc = computed(() => activeTab.value?.timelineDoc ?? null)

  const activeFileForPane = computed(() => {
    const tab = activeTab.value
    return tab ? findNode(tab.fileNodeId) : null
  })

  // ── Core state ──
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
  // Reset transient state when the active tab/doc changes (tab switch)
  watch(activeTab, (newTab) => {
    dirty.value = newTab?.dirty ?? false
    selectedClip.value = null
    globalPlayhead.value = 0
    isPlaying.value = false
  })

  // Sync dirty state to the tab (so it's preserved across tab switches)
  watch(dirty, (val) => {
    const tab = activeTab.value
    if (tab) setTabDirty(tab.id, val)
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

  const totalDuration = computed(() => {
    if (!doc.value) return 0
    return computeTotalDuration(doc.value)
  })

  const timelineWidth = computed(() => {
    return Math.max(600, totalDuration.value * pixelsPerSecond.value + 200)
  })

  // ── Ruler ──

  const rulerMarks = computed(() => {
    const marks: { pos: number; label: string }[] = []
    const width = timelineWidth.value
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
  })

  // ── Track operations ──

  function addTrack() {
    if (!doc.value) return
    doc.value.tracks.push({ name: `Track ${doc.value.tracks.length + 1}`, clips: [], volume: 1.0 })
    markDirty()
  }

  function removeTrack(index: number) {
    if (!doc.value) return
    doc.value.tracks.splice(index, 1)
    if (selectedClip.value?.trackIndex === index) selectedClip.value = null
    markDirty()
  }

  function setTrackVolume(trackIndex: number, vol: number) {
    if (!doc.value) return
    const track = doc.value.tracks[trackIndex]
    if (!track) return
    track.volume = Math.max(0, vol)
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
      volume: 1.0,
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

  /** Split all clips at the global playhead position (blade cut across all tracks) */
  function splitAtPlayhead() {
    if (!doc.value) return
    const didSplit = splitAllAtPlayhead(doc.value, globalPlayhead.value)
    if (didSplit) markDirty()
    return didSplit
  }

  // ── Playback controls ──

  function togglePlay() {
    isPlaying.value = !isPlaying.value
  }

  function seekTo(time: number) {
    globalPlayhead.value = Math.max(0, Math.min(time, totalDuration.value))
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
    const file = activeFileForPane.value
    const timeline = doc.value
    if (!file?.sourceId || !timeline || !sourcesDir.value) return
    await saveTimelineById(file.sourceId, timeline)
    dirty.value = false
  }

  return {
    // Pane-scoped active file (used in template guards)
    activeFile: activeFileForPane,
    activeTimeline: doc,

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
    setTrackVolume,
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
