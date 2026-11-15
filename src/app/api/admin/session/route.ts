import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// Minimal protected endpoint; also the pattern every future admin API must follow.
export async function GET() {
  const denied = await requireAdminApi()
  if (denied) return denied
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
