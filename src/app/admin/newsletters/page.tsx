import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccessDenied } from '@/components/admin-access'
import { getAdminSession } from '@/lib/admin-auth'
import { subscriberAdminRequest } from '@/lib/subscriber-admin'

export const dynamic = 'force-dynamic'

interface NewsletterRun {
  campaignId: string
  subject: string
  postSlug?: string
  startedAt: string
  updatedAt?: string
  status: 'in_progress' | 'completed' | 'failed'
  total: number | null
  attempted: number
  accepted: number
}

export default async function NewslettersPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (!await getAdminSession()) return <AccessDenied />

  const { cursor } = await searchParams
  const params = new URLSearchParams({ mode: 'history' })
  if (cursor) params.set('cursor', cursor)
  const result = await subscriberAdminRequest<{ items: NewsletterRun[]; nextCursor?: string }>(params)
  return (
    <div className="space-y-8">
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">&larr; Admin home</Link>
      <div><h1 className="text-2xl font-semibold tracking-tight">Newsletter history</h1>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Acceptance by Resend is not confirmed delivery. Delivery events and older sends are not recorded.</p></div>
      {!result.ok ? <p role="alert">{result.error}</p> : <>
        <p className="text-sm text-neutral-500">A failed or in-progress run may have sent messages. Review it before starting another run.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-neutral-300 dark:border-neutral-700">
            <th className="py-3">Newsletter</th><th>Started</th><th>Status</th><th>Recipients</th><th>Attempted</th><th>Accepted</th>
          </tr></thead>
          <tbody>{result.data.items.map((row) => <tr key={row.campaignId} className="border-b border-neutral-200 dark:border-neutral-800">
            <td className="py-3 pr-4">{row.subject}<div className="text-xs text-neutral-500">{row.postSlug || row.campaignId}</div></td>
            <td className="pr-4">{row.startedAt}</td><td className="pr-4">{row.status.replace('_', ' ')}</td>
            <td className="pr-4">{row.total ?? 'Unknown'}</td><td className="pr-4">{row.attempted}</td><td>{row.accepted}</td>
          </tr>)}</tbody>
        </table></div>
        {!result.data.items.length && <p>No recorded newsletter runs.</p>}
        <div className="flex gap-4 text-sm">
          {cursor && <Link href="/admin/newsletters" className="underline">First page</Link>}
          {result.data.nextCursor && <Link href={`/admin/newsletters?${new URLSearchParams({ cursor: result.data.nextCursor })}`} className="underline">Next page</Link>}
        </div>
      </>}
    </div>
  )
}
