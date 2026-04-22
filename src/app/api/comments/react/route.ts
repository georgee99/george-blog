import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_REACTIONS = new Set(['👍', '👎', '❤️', '😢', '😡'])

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { postSlug, commentId, emoji, action } = (body ?? {}) as Record<string, unknown>

  if (
    !postSlug || typeof postSlug !== 'string' ||
    !commentId || typeof commentId !== 'string' ||
    !emoji || typeof emoji !== 'string' || !ALLOWED_REACTIONS.has(emoji) ||
    (action !== undefined && action !== 'add' && action !== 'remove')
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (process.env.NODE_ENV === 'development') {
    console.debug('Reaction received (not saved in development):', { postSlug, commentId, emoji, action })
    return NextResponse.json({ reactions: { [emoji]: action === 'remove' ? 0 : 1 } })
  }

  const reactionsUrl = process.env.REACTIONS_API_URL
  if (!reactionsUrl) {
    return NextResponse.json({ error: 'Reactions service unavailable' }, { status: 503 })
  }

  const lambdaRes = await fetch(reactionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.COMMENTS_API_KEY ?? '',
    },
    body: JSON.stringify({ postSlug, commentId, emoji, action }),
  })

  const data = await lambdaRes.json().catch(() => ({}))
  return NextResponse.json(data, { status: lambdaRes.status })
}
