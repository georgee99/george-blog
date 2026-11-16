import 'server-only'

export interface ModerationEntry {
  postSlug: string
  commentId: string
  author: string
  content: string
  createdAt: string
  parentId?: string
  isHidden: boolean
}

export interface ModerationPage {
  items: ModerationEntry[]
  nextCursor?: string
}

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function request<T>(method: 'GET' | 'POST', params?: URLSearchParams, body?: object): Promise<Result<T>> {
  const url = process.env.MODERATION_API_URL
  const key = process.env.MODERATION_API_KEY
  if (!url || !key) return { ok: false, status: 503, error: 'Moderation service is not configured.' }

  try {
    const res = await fetch(`${url}${params && params.size ? `?${params}` : ''}`, {
      method,
      headers: { 'x-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null)
      const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error : `Moderation service returned ${res.status}.`
      return { ok: false, status: res.status, error: message }
    }
    return { ok: true, data: await res.json() as T }
  } catch (error) {
    console.error('Could not reach moderation service:', error)
    return { ok: false, status: 502, error: 'Could not reach the moderation service.' }
  }
}

export function listEntries(params: URLSearchParams) {
  return request<ModerationPage>('GET', params)
}

export function moderateEntry(body: { postSlug: string; commentId: string; action: 'hide' | 'restore' | 'delete' }) {
  return request<{ ok: true }>('POST', undefined, body)
}
