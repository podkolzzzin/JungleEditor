/**
 * Time formatting and parsing utilities — pure functions, no UI dependencies.
 */

/** Format seconds as M:SS.f (compact) */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * 10)
  return `${m}:${s.toString().padStart(2, '0')}.${f}`
}

/** Format seconds as HH:MM:SS.mmm (full precision) */
export function formatTimeFull(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

/** Parse a time string (H:M:S.ms or M:S.f or plain number) into seconds */
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
