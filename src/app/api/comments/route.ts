import { seedCommentData, seedGuestbookData } from '@/lib/seedData'
import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

function hashIp(ip: string): string | undefined {
  const secret = process.env.IP_HASH_SECRET
  if (!secret) {
    console.error('IP_HASH_SECRET is not set; skipping ipHash')
    return undefined
  }
  return createHmac('sha256', secret).update(ip).digest('hex')
}

// Vercel overwrites x-real-ip on every request, so clients cannot spoof it
function getIp(req: NextRequest): string {
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

interface Location {
  countryCode?: string
  regionCode?: string
  city?: string
  timezone?: string
  latitude?: number
  longitude?: number
  locationPrecision: 'city' | 'region' | 'country' | 'unknown'
}

interface Network {
  asn: string
  as_name?: string
  as_domain?: string
}

async function getNetwork(ip: string): Promise<Network | undefined> {
  const token = process.env.IPINFO_TOKEN
  if (!token) {
    console.error('IPINFO_TOKEN is not set; skipping IP network lookup')
    return undefined
  }

  try {
    const response = await fetch(
      `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    )
    if (!response.ok) {
      console.error(`IPinfo lookup failed with status ${response.status}`)
      return undefined
    }

    const data: unknown = await response.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.error('IPinfo returned an invalid response')
      return undefined
    }

    const raw = data as Record<string, unknown>
    const { asn, as_name: asName, as_domain: asDomain } = raw
    const asnValue = typeof asn === 'string' ? asn.trim() : ''
    const asNameValue = typeof asName === 'string' ? asName.trim() : ''
    const asDomainValue = typeof asDomain === 'string' ? asDomain.trim() : ''
    const asnValid = /^AS\d{1,10}$/i.test(asnValue)
    const asNameValid = Boolean(asNameValue)
    const asDomainValid = Boolean(asDomainValue)

    console.info('IPinfo ASN field status', {
      asn: { present: asn !== undefined && asn !== null, valid: asnValid },
      as_name: { present: asName !== undefined && asName !== null, valid: asNameValid },
      as_domain: { present: asDomain !== undefined && asDomain !== null, valid: asDomainValid },
    })

    if (!asnValid) {
      console.error('IPinfo response did not contain a valid ASN')
      return undefined
    }

    return {
      asn: asnValue,
      ...(asNameValid ? { as_name: asNameValue.slice(0, 200) } : {}),
      ...(asDomainValid ? { as_domain: asDomainValue.slice(0, 200) } : {}),
    }
  } catch (error) {
    console.error('IPinfo lookup failed; continuing without network details', error)
    return undefined
  }
}

// Vercel sets these geo headers itself; city is URL-encoded
function getLocation(req: NextRequest): Location {
  const decode = (v: string | null) => {
    if (!v) return undefined
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }
  const countryCode = decode(req.headers.get('x-vercel-ip-country'))
  const regionCode = decode(req.headers.get('x-vercel-ip-country-region'))
  const city = decode(req.headers.get('x-vercel-ip-city'))
  const timezone = decode(req.headers.get('x-vercel-ip-timezone'))
  // Rounded to 2 decimals (~1 km); the IP-derived position is only approximate anyway
  const coord = (v: string | null) => {
    const n = v ? Number.parseFloat(v) : NaN
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined
  }
  const latitude = coord(req.headers.get('x-vercel-ip-latitude'))
  const longitude = coord(req.headers.get('x-vercel-ip-longitude'))

  const locationPrecision = city ? 'city' : regionCode ? 'region' : countryCode ? 'country' : 'unknown'
  return {
    ...(countryCode ? { countryCode } : {}),
    ...(regionCode ? { regionCode } : {}),
    ...(city ? { city } : {}),
    ...(timezone ? { timezone } : {}),
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    locationPrecision,
  }
}

export async function GET(req: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    const postSlug = req.nextUrl.searchParams.get('postSlug')
    console.debug('Using seed comment data in development');
    return NextResponse.json(postSlug === 'guestbook' ? seedGuestbookData : seedCommentData, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const lambdaUrl = process.env.COMMENTS_API_URL
  if (!lambdaUrl) {
    return NextResponse.json({ error: 'Comments service unavailable' }, { status: 503 })
  }

  const postSlug = req.nextUrl.searchParams.get('postSlug')
  if (!postSlug) {
    return NextResponse.json({ error: 'postSlug is required' }, { status: 400 })
  }

  const lambdaRes = await fetch(`${lambdaUrl}?postSlug=${encodeURIComponent(postSlug)}`, {
    method: 'GET',
    headers: { 'x-api-key': process.env.COMMENTS_API_KEY ?? '' },
    next: { revalidate: 0 }, // always fresh
  })

  const data = await lambdaRes.json().catch(() => ({}))
  return NextResponse.json(data, { status: lambdaRes.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const lambdaUrl = process.env.COMMENTS_API_URL
  if (!lambdaUrl) {
    console.error('COMMENTS_API_URL is not set')
    return NextResponse.json({ error: 'Comments service unavailable' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Call Spiderman' }, { status: 400 })
  }

  // Basic validation
  const { postSlug, authorName, body: commentBody, parentId, clientId } = (body ?? {}) as Record<string, unknown>
  if (
    !postSlug || typeof postSlug !== 'string' ||
    !authorName || typeof authorName !== 'string' ||
    !commentBody || typeof commentBody !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Invalid request. Please check your input and try again.' },
      { status: 400 },
    )
  }

  // for development, we can just return the comment without saving
  if (process.env.NODE_ENV === 'development') {
    console.debug('Received comment (not saved in development):', { postSlug, authorName, body: commentBody, parentId })
    return NextResponse.json({ message: 'Comment received (not saved in development)' })
  }

  const ip = getIp(req)
  const ipHash = ip === 'unknown' ? undefined : hashIp(ip)
  const location = getLocation(req)
  const network = ip === 'unknown' ? undefined : await getNetwork(ip)
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  const lambdaRes = await fetch(lambdaUrl, {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'x-api-key': process.env.COMMENTS_API_KEY ?? '',
    },
    body: JSON.stringify({
      postSlug,
      authorName,
      body: commentBody,
      ...(ipHash ? { ipHash } : {}),
      location,
      ...(network ? { network } : {}),
      userAgent,
      ...(typeof clientId === 'string' && clientId ? { clientId } : {}),
      ...(parentId ? { parentId } : {}),
    }),
  })

  const data = await lambdaRes.json().catch(() => ({}))
  return NextResponse.json(data, { status: lambdaRes.status })
}
