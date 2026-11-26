import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth'
import { fetchSummary } from '@/lib/rag-analytics/admin-client'
import { resolveRange } from '@/lib/rag-analytics/format'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  const p = req.nextUrl.searchParams
  const status = p.get('status')
  const feedback = p.get('feedback')
  const range = resolveRange(p.get('from') ?? undefined, p.get('to') ?? undefined)
  const result = await fetchSummary({
    ...range,
    ...(status === 'success' || status === 'failure' ? { status } : {}),
    ...(feedback === 'up' || feedback === 'down' ? { feedback } : {}),
  })

  return result.ok
    ? NextResponse.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error: result.error }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
}
