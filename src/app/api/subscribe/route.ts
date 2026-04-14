import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const subscribeApiUrl = process.env.SUBSCRIBE_API_URL

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    console.debug('Received subscription request (not sent in development):', await req.json())
    return NextResponse.json({ message: 'Subscription received (not sent in development)' })
  }

  if (!subscribeApiUrl) {
    return NextResponse.json({ error: 'Subscription service unavailable' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { email, source } = (body ?? {}) as Record<string, unknown>
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const subscriptionApiRes = await fetch(subscribeApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.SUBSCRIBE_API_KEY ?? '',
    },
    body: JSON.stringify({ email, source: source ?? null }),
  })

  const data = await subscriptionApiRes.json().catch(() => ({}))
  return NextResponse.json(data, { status: subscriptionApiRes.status })
}
