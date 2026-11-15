import { NextResponse } from 'next/server'
import { auth, isAdminSub } from '@/auth'

export async function getAdminSession() {
  const session = await auth()
  return session && isAdminSub(session.user?.id) ? session : null
}

// Use at the top of every admin API handler; returns a response when access is denied.
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  }
  if (!isAdminSub(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStore })
  }
  return null
}

const noStore = { 'Cache-Control': 'no-store' }
