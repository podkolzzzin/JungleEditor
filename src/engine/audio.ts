/**
 * Audio engine — manages real-time audio mixing via the Web Audio API.
 *
 * Architecture:
 * - Single AudioContext for the session
 * - One GainNode per track (volume / mute)
 * - One AudioBufferSourceNode (or MediaElementSourceNode) per playing clip
 * - AnalyserNode for waveform / spectrum visualisation
 *
 * Future: OfflineAudioContext for export-time mix-down.
 */

export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null

  async init(): Promise<void> {
    this.ctx = new AudioContext({ sampleRate: 48000 })
    this.masterGain = this.ctx.createGain()
    this.masterGain.connect(this.ctx.destination)
  }

  setMasterVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(value, this.ctx!.currentTime)
    }
  }

  get context(): AudioContext | null {
    return this.ctx
  }

  destroy(): void {
    this.ctx?.close()
    this.ctx = null
    this.masterGain = null
  }
}
