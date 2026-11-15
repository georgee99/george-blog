import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth'
import { fetchQueryDetail } from '@/lib/rag-analytics/admin-client'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'no-store' }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ queryId: string }> }) {
  const denied = await requireAdminApi()
  if (denied) return denied

  const { queryId } = await ctx.params
  if (!UUID_RE.test(queryId)) return NextResponse.json({ error: 'Invalid queryId' }, { status: 400, headers })

  const result = await fetchQueryDetail(queryId)
  if (result.ok) return NextResponse.json(result.data, { headers })
  return NextResponse.json(
    { error: result.error },
    { status: result.error === 'Not found.' ? 404 : 502, headers },
  )
}
