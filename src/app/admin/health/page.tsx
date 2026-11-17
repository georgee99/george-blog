import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccessDenied } from '@/components/admin-access'
import { getAdminSession } from '@/lib/admin-auth'
import { getRagCoverage } from '@/lib/rag-coverage'
import { subscriberAdminRequest } from '@/lib/subscriber-admin'

export const dynamic = 'force-dynamic'

async function analyticsHealth(): Promise<string> {
  const url = process.env.RAG_ANALYTICS_API_URL
  const key = process.env.RAG_ANALYTICS_API_KEY
  if (!url || !key) return 'Not configured'
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/queries?limit=1`, {
      headers: { 'x-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    })
    return response.ok ? 'Reachable and authenticated' : `Failed (HTTP ${response.status})`
  } catch (error) {
    console.error('RAG analytics health check failed:', error)
    return 'Unreachable or timed out'
  }
}

export default async function HealthPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (!await getAdminSession()) return <AccessDenied />
  const [subscriber, analytics] = await Promise.all([
    subscriberAdminRequest<{ ok: boolean }>(new URLSearchParams({ mode: 'health' }), 5_000),
    analyticsHealth(),
  ])
  let embeddings = 'Readable'
  try {
    getRagCoverage()
  } catch (error) {
    console.error('RAG coverage health check failed:', error)
    embeddings = 'Unavailable or invalid'
  }
  const moderation = process.env.MODERATION_API_URL && process.env.MODERATION_API_KEY
    ? 'Configured; connectivity not checked' : 'Not configured'
  const checks = [
    ['Subscriber service', subscriber.ok && subscriber.data.ok ? 'Reachable, authenticated and able to read table' : subscriber.ok ? 'Failed' : subscriber.error],
    ['RAG analytics', analytics],
    ['RAG content', embeddings],
    ['Moderation service', moderation],
    ['Newsletter delivery', 'Not checked; no email is sent'],
  ]
  return (
    <div className="space-y-8">
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">&larr; Admin home</Link>
      <div><h1 className="text-2xl font-semibold tracking-tight">Site health</h1>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Read-only checks run when this page loads. They do not send email or make AI requests.</p></div>
      <p className="text-xs text-neutral-500">Checked at {new Date().toISOString()}</p>
      <div className="divide-y divide-neutral-200 border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {checks.map(([name, status]) => <div key={name} className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between">
          <span className="font-medium">{name}</span><span className="text-sm text-neutral-500 dark:text-neutral-400">{status}</span>
        </div>)}
      </div>
    </div>
  )
}
