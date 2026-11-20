const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_RANGE_DAYS = 92

export function isValidDay(v: unknown): v is string {
  return typeof v === 'string' && DAY_RE.test(v) && Number.isFinite(Date.parse(v))
}

export function todaySydney(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now))
  const part = (type: string) => parts.find((p) => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(day) + delta * DAY_MS).toISOString().slice(0, 10)
}

// Defaults to the last 7 Sydney calendar days; invalid input falls back rather than erroring.
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  now = Date.now(),
): { from: string; to: string } {
  const end = isValidDay(to) ? to : todaySydney(now)
  const start = isValidDay(from) ? from : addDays(end, -6)
  return start <= end ? { from: start, to: end } : { from: end, to: start }
}

export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1
}

const int = new Intl.NumberFormat('en-US')

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : int.format(Math.round(n)))

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n === 0) return '$0.00'
  return n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`
}

export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)

export function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })
}
