import { NextRequest, NextResponse } from 'next/server'
import { validFeedbackToken } from '@/lib/rag-analytics/feedback-token'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WINDOW_MS = 60 * 60 * 1000
const attempts = new Map<string, { count: number; start: number }>()

export async function POST(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  const origin = req.headers.get('origin')
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers })

  const now = Date.now()
  for (const [ip, entry] of attempts) if (now - entry.start > WINDOW_MS) attempts.delete(ip)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!attempts.has(ip) && attempts.size >= 10000) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  const entry = attempts.get(ip) ?? { count: 0, start: now }
  entry.count++
  attempts.set(ip, entry)
  if (entry.count > 30) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })

  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Invalid request' }, { status: 415, headers })
  if (Number(req.headers.get('content-length') ?? 0) > 1024) return NextResponse.json({ error: 'Invalid request' }, { status: 413, headers })
  let body: Record<string, unknown>
  try {
    const reader = req.body?.getReader()
    if (!reader) throw new Error('Empty body')
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024) {
        await reader.cancel()
        return NextResponse.json({ error: 'Invalid request' }, { status: 413, headers })
      }
      chunks.push(value)
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers })
  }
  const { queryId, timestamp, token, rating } = body
  const key = process.env.RAG_ANALYTICS_API_KEY
  const baseUrl = process.env.RAG_ANALYTICS_API_URL
  if (!key || !baseUrl) return NextResponse.json({ error: 'Feedback unavailable' }, { status: 503, headers })
  if (typeof queryId !== 'string' || !UUID_RE.test(queryId) ||
      typeof timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > now || now - Date.parse(timestamp) > WINDOW_MS ||
      typeof token !== 'string' || !validFeedbackToken(queryId, timestamp, token, key) ||
      (rating !== 'up' && rating !== 'down')) {
    return NextResponse.json({ error: 'Invalid feedback' }, { status: 400, headers })
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ queryId, timestamp, rating }),
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return NextResponse.json({ ok: true }, { headers })
      if (res.status === 409) return NextResponse.json({ error: 'Already rated' }, { status: 409, headers })
      if (res.status !== 404 || attempt === 4) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch {
    // Feedback failures must not affect the answer.
  }
  return NextResponse.json({ error: 'Feedback unavailable' }, { status: 503, headers })
}
