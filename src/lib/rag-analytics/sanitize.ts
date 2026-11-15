export type ErrorCategory =
  | 'upstream_rate_limited'
  | 'upstream_auth'
  | 'upstream_error'
  | 'timeout'
  | 'internal_error'

// Query text is retained for a limited time, so strip obvious personal data and secrets first.
export function sanitizeQueryText(input: string): string {
  return input
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\bhttps?:\/\/\S+/gi, '[url]')
    .replace(/\b(?:sk|pk|key|token)[-_][A-Za-z0-9_-]{8,}\b/gi, '[secret]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]')
    .trim()
    .slice(0, 500)
}

// Only a coarse category is stored; raw error messages never leave the request.
export function categorizeError(error: unknown): ErrorCategory {
  const e = error as { status?: unknown; name?: unknown; code?: unknown } | null
  if (e && typeof e === 'object') {
    if (e.name === 'APIConnectionTimeoutError' || e.name === 'AbortError' || e.code === 'ETIMEDOUT') {
      return 'timeout'
    }
    if (typeof e.status === 'number') {
      if (e.status === 429) return 'upstream_rate_limited'
      if (e.status === 401 || e.status === 403) return 'upstream_auth'
      if (e.status >= 500) return 'upstream_error'
    }
  }
  return 'internal_error'
}
