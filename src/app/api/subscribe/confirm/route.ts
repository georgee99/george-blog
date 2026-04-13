import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const subscribeApiUrl = process.env.SUBSCRIBE_API_URL
  if (!subscribeApiUrl) {
    return NextResponse.json({ error: 'Subscription service unavailable' }, { status: 503 })
  }

  const email = req.nextUrl.searchParams.get('email')
  const token = req.nextUrl.searchParams.get('token')

  if (!email || !token) {
    return NextResponse.json({ error: 'email and token are required' }, { status: 400 })
  }

  // Forward to the Lambda confirm endpoint (base URL without /subscribe, add /subscribe/confirm)
  const confirmUrl = subscribeApiUrl.replace(/\/subscribe$/, '/subscribe/confirm')
  const apiConfirmationResponse = await fetch(
    `${confirmUrl}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
    {
      method: 'GET',
      headers: { 'x-api-key': process.env.SUBSCRIBE_API_KEY ?? '' },
    },
  )

  const data = await apiConfirmationResponse.json().catch(() => ({}))
  return NextResponse.json(data, { status: apiConfirmationResponse.status })
}
