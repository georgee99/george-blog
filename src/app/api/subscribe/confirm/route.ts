import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const subscribeApiUrl = process.env.SUBSCRIBE_API_URL
  if (!subscribeApiUrl) {
    return NextResponse.redirect(
      new URL('/subscribe/confirm?status=error&message=Subscription+service+unavailable', req.url),
    )
  }

  const email = req.nextUrl.searchParams.get('email')
  const token = req.nextUrl.searchParams.get('token')

  if (!email || !token) {
    return NextResponse.redirect(
      new URL('/subscribe/confirm?status=error&message=Invalid+confirmation+link', req.url),
    )
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

  if (apiConfirmationResponse.ok) {
    return NextResponse.redirect(new URL('/subscribe/confirm?status=success', req.url))
  }

  const data = await apiConfirmationResponse.json().catch(() => ({}))
  const message = encodeURIComponent(data?.message ?? data?.error ?? 'Could not confirm your subscription.')
  return NextResponse.redirect(new URL(`/subscribe/confirm?status=error&message=${message}`, req.url))
}
