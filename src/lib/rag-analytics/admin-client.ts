import type { RagQueryRecord } from './types'

export interface QuerySummaryRow {
  queryId: string
  timestamp: string
  queryText?: string
  model: string
  retrievalMethod: string
  status: 'success' | 'failure'
  totalMs: number
  chunkCount: number
  errorCategory?: string
}

export interface DailyPoint {
  day: string
  queries: number
  failures: number
  avgTotalMs: number | null
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface SummaryResponse {
  range: { from: string; to: string }
  totals: {
    queries: number
    success: number
    failure: number
    failureRate: number | null
    avgTotalMs: number | null
    p95TotalMs: number | null
    avgRetrievalMs: number | null
    avgGenerationMs: number | null
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    queriesWithUsage: number
    queriesWithCost: number
  }
  daily: DailyPoint[]
}

export interface QueriesResponse {
  items: QuerySummaryRow[]
  nextCursor?: string
}

export interface AnalyticsFilters {
  from?: string
  to?: string
  status?: 'success' | 'failure'
  limit?: number
  cursor?: string
}

export type AnalyticsResult<T> = { ok: true; data: T } | { ok: false; error: string }

const TIMEOUT_MS = 15_000

async function request<T>(path: string, filters: AnalyticsFilters): Promise<AnalyticsResult<T>> {
  const baseUrl = process.env.RAG_ANALYTICS_API_URL
  const apiKey = process.env.RAG_ANALYTICS_API_KEY
  if (!baseUrl || !apiKey) return { ok: false, error: 'Analytics service is not configured.' }

  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') params.set(k, String(v))
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}?${params}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 404) return { ok: false, error: 'Not found.' }
    if (res.status === 400) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? 'Invalid request.' }
    }
    if (!res.ok) return { ok: false, error: `Analytics service returned ${res.status}.` }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, error: 'Could not reach the analytics service.' }
  }
}

// Server-only. Callers must already have verified the admin session.
export function fetchSummary(filters: AnalyticsFilters) {
  return request<SummaryResponse>('/summary', filters)
}

export function fetchQueries(filters: AnalyticsFilters) {
  return request<QueriesResponse>('/queries', filters)
}

export function fetchQueryDetail(queryId: string) {
  return request<RagQueryRecord>(`/queries/${encodeURIComponent(queryId)}`, {})
}
