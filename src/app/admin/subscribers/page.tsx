import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccessDenied } from '@/components/admin-access'
import { getAdminSession } from '@/lib/admin-auth'
import { subscriberAdminRequest, type SubscriberRow } from '@/lib/subscriber-admin'

export const dynamic = 'force-dynamic'

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (!await getAdminSession()) return <AccessDenied />

  const { cursor } = await searchParams
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  const [summary, page] = await Promise.all([
    subscriberAdminRequest<{ counts: Record<string, number>; fetchedAt: string }>(new URLSearchParams({ mode: 'summary' })),
    subscriberAdminRequest<{ items: SubscriberRow[]; nextCursor?: string }>(params),
  ])
  return (
    <div className="space-y-8">
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">&larr; Admin home</Link>
      <div><h1 className="text-2xl font-semibold tracking-tight">Subscribers</h1>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Current subscription statuses and addresses. This information is private.</p></div>
      {!summary.ok ? <p role="alert">{summary.error}</p> : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-sm text-neutral-500">Total</p><p className="mt-2 text-2xl">{Object.values(summary.data.counts).reduce((sum, count) => sum + count, 0)}</p>
          </div>
          {Object.entries(summary.data.counts).map(([status, count]) => (
            <div key={status} className="border border-neutral-200 p-4 dark:border-neutral-800">
              <p className="text-sm capitalize text-neutral-500">{status}</p><p className="mt-2 text-2xl">{count}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500">Counts fetched {summary.data.fetchedAt}. Results may change during the scan.</p>
      </>}
      {!page.ok ? <p role="alert">{page.error}</p> : <>
        <p className="text-sm text-neutral-500">DynamoDB scan order; not sorted by date.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-neutral-300 dark:border-neutral-700"><th className="py-3">Email</th><th>Status</th><th>Joined</th><th>Source</th></tr></thead>
          <tbody>{page.data.items.map((row) => <tr key={row.email} className="border-b border-neutral-200 dark:border-neutral-800">
            <td className="py-3 pr-4">{row.email}</td><td className="pr-4">{row.status}</td><td className="pr-4">{row.createdAt || 'Unknown'}</td><td>{row.source || 'Unknown'}</td>
          </tr>)}</tbody>
        </table></div>
        {!page.data.items.length && <p>No subscribers on this page.</p>}
        <div className="flex gap-4 text-sm">
          {cursor && <Link href="/admin/subscribers" className="underline">First page</Link>}
          {page.data.nextCursor && <Link href={`/admin/subscribers?${new URLSearchParams({ cursor: page.data.nextCursor })}`} className="underline">Next page</Link>}
        </div>
      </>}
    </div>
  )
}
