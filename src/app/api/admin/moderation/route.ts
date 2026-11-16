import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth'
import { listEntries, moderateEntry } from '@/lib/moderation/admin-client'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  const params = new URLSearchParams()
  for (const name of ['type', 'status', 'cursor']) {
    const value = req.nextUrl.searchParams.get(name)
    if (value !== null) params.set(name, value)
  }
  const result = await listEntries(params)
  return result.ok
    ? NextResponse.json(result.data, { headers: noStore })
    : NextResponse.json({ error: result.error }, { status: result.status, headers: noStore })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdminApi()
  if (denied) return denied

  const origin = req.headers.get('origin')
  if (!origin || origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: noStore })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400, headers: noStore })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore })
  }
  const { postSlug, commentId, action } = body as Record<string, unknown>
  if (typeof postSlug !== 'string' || typeof commentId !== 'string' ||
      (action !== 'hide' && action !== 'restore' && action !== 'delete')) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore })
  }
  const result = await moderateEntry({ postSlug, commentId, action })
  return result.ok
    ? NextResponse.json(result.data, { headers: noStore })
    : NextResponse.json({ error: result.error }, { status: result.status, headers: noStore })
}
