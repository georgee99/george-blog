import type { RagTrace } from './trace'

const PERSIST_TIMEOUT_MS = 3000

// Never throws and never rejects: analytics must not affect the public search.
export async function flushTrace(trace: RagTrace): Promise<void> {
  const baseUrl = process.env.RAG_ANALYTICS_API_URL
  const apiKey = process.env.RAG_ANALYTICS_API_KEY
  if (!baseUrl || !apiKey) return

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(trace.toRecord()),
      cache: 'no-store',
      signal: AbortSignal.timeout(PERSIST_TIMEOUT_MS),
    })
    if (!res.ok) console.error(`[rag-analytics] persist failed with status ${res.status}`)
  } catch (error) {
    console.error('[rag-analytics] persist failed', error instanceof Error ? error.name : 'unknown')
  }
}
