import 'server-only'

export interface SubscriberRow {
  email: string
  status: string
  createdAt?: string
  confirmedAt?: string | null
  source?: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function subscriberAdminRequest<T>(params: URLSearchParams, timeout = 25_000): Promise<Result<T>> {
  const url = process.env.SUBSCRIBER_ADMIN_API_URL
  const key = process.env.SUBSCRIBER_ADMIN_API_KEY
  if (!url || !key) return { ok: false, error: 'Subscriber admin service is not configured.' }
  try {
    const target = new URL(url)
    params.forEach((value, name) => target.searchParams.set(name, value))
    const response = await fetch(target, { headers: { 'x-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(timeout) })
    if (!response.ok) return { ok: false, error: `Subscriber admin service returned ${response.status}.` }
    return { ok: true, data: await response.json() as T }
  } catch (error) {
    console.error('Could not reach subscriber admin service:', error)
    return { ok: false, error: 'Could not reach the subscriber admin service.' }
  }
}
