import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const subscribeApiUrl = process.env.SUBSCRIBE_API_URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    console.debug('Unsubscribe request (dev):', req.nextUrl.search)
    return NextResponse.redirect(new URL('/?unsubscribe=success', req.url))
  }

  if (!subscribeApiUrl) {
    return NextResponse.redirect(new URL('/?unsubscribe=error', siteUrl))
  }

  const email = req.nextUrl.searchParams.get('email')
  const token = req.nextUrl.searchParams.get('token')

  if (!email || !token) {
    return NextResponse.redirect(new URL('/?unsubscribe=invalid', siteUrl))
  }

  const lambdaRes = await fetch(
    `${subscribeApiUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
    {
      method: 'GET',
      headers: { 'x-api-key': process.env.SUBSCRIBE_API_KEY ?? '' },
      redirect: 'manual',
    },
  )

  // Lambda returns 302 redirect — follow to the location or just pass success
  const location = lambdaRes.headers.get('location')
  const dest = location ?? `${siteUrl}/?unsubscribe=success`
  return NextResponse.redirect(dest)
}
