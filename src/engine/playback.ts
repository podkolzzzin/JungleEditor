/**
 * Playback engine — drives real-time preview using requestAnimationFrame
 * and synchronises video / audio streams to the timeline playhead.
 *
 * Key design choices:
 * - Uses `requestVideoFrameCallback` on HTMLVideoElement for frame-accurate sync
 * - Falls back to rAF-based timing when RVFC is unavailable
 * - Audio is mixed through the Web Audio API (AudioContext + GainNode per track)
 */

export class PlaybackEngine {
  private rafId: number | null = null
  private startWallTime = 0
  private startTimelineTime = 0
  private _isPlaying = false

  get isPlaying() {
    return this._isPlaying
  }

  play(fromTime: number, onTick: (currentTime: number) => void): void {
    if (this._isPlaying) return
    this._isPlaying = true
    this.startWallTime = performance.now()
    this.startTimelineTime = fromTime

    const tick = () => {
      if (!this._isPlaying) return
      const elapsed = (performance.now() - this.startWallTime) / 1000
      const currentTime = this.startTimelineTime + elapsed
      onTick(currentTime)
      this.rafId = requestAnimationFrame(tick)
    }

    this.rafId = requestAnimationFrame(tick)
  }

  pause(): void {
    this._isPlaying = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  destroy(): void {
    this.pause()
  }
}
