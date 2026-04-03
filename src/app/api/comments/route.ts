import { NextRequest, NextResponse } from 'next/server'

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
  const { postSlug, authorName, body: commentBody } = (body ?? {}) as Record<string, unknown>
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

  const lambdaRes = await fetch(lambdaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postSlug, authorName, body: commentBody }),
  })

  const data = await lambdaRes.json().catch(() => ({}))
  return NextResponse.json(data, { status: lambdaRes.status })
}
