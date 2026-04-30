import { seedCommentData, seedGuestbookData } from '@/lib/seedData'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function GET(req: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    const postSlug = req.nextUrl.searchParams.get('postSlug')
    console.debug('Using seed comment data in development');
    return NextResponse.json(postSlug === 'guestbook' ? seedGuestbookData : seedCommentData)
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
  return NextResponse.json(data, { status: lambdaRes.status })
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

  const ipHash = hashIp(getIp(req))
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
      ipHash,
      userAgent,
      ...(typeof clientId === 'string' && clientId ? { clientId } : {}),
      ...(parentId ? { parentId } : {}),
    }),
  })

  const data = await lambdaRes.json().catch(() => ({}))
  return NextResponse.json(data, { status: lambdaRes.status })
}
