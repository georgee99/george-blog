import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccessDenied } from '@/components/admin-access'
import { getAdminSession } from '@/lib/admin-auth'
import { getRagCoverage } from '@/lib/rag-coverage'

export const dynamic = 'force-dynamic'

export default async function RagCoveragePage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (!await getAdminSession()) return <AccessDenied />

  let coverage: ReturnType<typeof getRagCoverage> | null = null
  try {
    coverage = getRagCoverage()
  } catch (error) {
    console.error('Failed to inspect RAG coverage:', error)
  }

  return (
    <div className="space-y-8">
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">&larr; Admin home</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RAG content coverage</h1>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Coverage of posts in this deployment. This check does not rebuild embeddings.</p>
      </div>
      {!coverage ? <p role="alert">Could not read the embeddings store or posts in this deployment. Check server logs.</p> : <>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Model: {coverage.model} · Built: {coverage.builtAt}</p>
        {coverage.modelMismatch && <p role="alert">The stored model differs from the configured embedding model; existing chunks need a rebuild.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['current', 'missing', 'stale', 'orphaned'] as const).map((status) => (
            <div key={status} className="border border-neutral-200 p-4 dark:border-neutral-800">
              <p className="text-sm capitalize text-neutral-500">{status}</p>
              <p className="mt-2 text-2xl">{coverage.rows.filter((row) => row.status === status).length}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-300 dark:border-neutral-700"><th className="py-3">Post</th><th>Status</th><th>Chunks</th></tr></thead>
            <tbody>{coverage.rows.map((row) => (
              <tr key={row.slug} className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-3 pr-4">{row.title}<div className="text-xs text-neutral-500">{row.slug}</div></td>
                <td className="pr-4 capitalize">{row.status}</td><td>{row.chunks}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>}
    </div>
  )
}
