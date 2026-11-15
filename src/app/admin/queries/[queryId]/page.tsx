import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getAdminSession } from '@/lib/admin-auth'
import { AccessDenied } from '@/components/admin-access'
import { fetchQueryDetail } from '@/lib/rag-analytics/admin-client'
import { fmtInt, fmtMs, fmtUsd } from '@/lib/rag-analytics/format'
import { STAGES, type Stage } from '@/lib/rag-analytics/types'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STAGE_LABEL: Record<Stage, string> = {
  rewrite: 'Query rewrite',
  embedding: 'Embedding',
  rerank: 'Re-ranking',
  generation: 'Generation',
}

const unavailable = <span className="italic text-neutral-400">not captured</span>

export default async function QueryDetailPage({ params }: { params: Promise<{ queryId: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  const admin = await getAdminSession()
  if (!admin) return <AccessDenied />

  const { queryId } = await params
  if (!UUID_RE.test(queryId)) notFound()

  const result = await fetchQueryDetail(queryId)
  if (!result.ok) {
    if (result.error === 'Not found.') notFound()
    return (
      <div className="space-y-6">
        <BackLink />
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {result.error}
        </p>
      </div>
    )
  }

  const r = result.data
  const t = r.timings
  const totalIn = STAGES.reduce<number | undefined>(
    (a, s) => (r.usage[s]?.inputTokens === undefined ? a : (a ?? 0) + r.usage[s]!.inputTokens!),
    undefined,
  )
  const totalOut = STAGES.reduce<number | undefined>(
    (a, s) => (r.usage[s]?.outputTokens === undefined ? a : (a ?? 0) + r.usage[s]!.outputTokens!),
    undefined,
  )

  return (
    <div className="space-y-10">
      <BackLink />

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Query detail</h1>
        <p className="break-words leading-relaxed text-neutral-900 dark:text-neutral-100">
          {r.queryText ? `“${r.queryText}”` : <span className="text-neutral-400">Query text not retained</span>}
        </p>
        <p className="text-xs text-neutral-400">
          Query text is stored with emails, URLs and number-like strings redacted, and expires after the retention
          period.
        </p>
      </div>

      <Section title="Overview">
        <Grid
          items={[
            { label: 'Time (UTC)', value: new Date(r.timestamp).toISOString().replace('T', ' ').slice(0, 19) },
            {
              label: 'Status',
              value:
                r.status === 'success' ? (
                  'Success'
                ) : (
                  <span className="text-red-600 dark:text-red-400">Failed</span>
                ),
            },
            { label: 'Model', value: r.model },
            { label: 'Retrieval method', value: r.retrievalMethod },
            { label: 'Query ID', value: <span className="break-all font-mono text-xs">{r.queryId}</span> },
            ...(r.status === 'failure'
              ? [{ label: 'Error category', value: r.errorCategory ?? unavailable }]
              : []),
          ]}
        />
      </Section>

      <Section title="Timings">
        <Grid
          items={[
            { label: 'Total latency', value: fmtMs(t.totalMs) },
            { label: 'Retrieval', value: t.retrievalMs === undefined ? unavailable : fmtMs(t.retrievalMs), note: 'rewrite + embedding + search' },
            { label: 'Generation', value: t.generationMs === undefined ? unavailable : fmtMs(t.generationMs) },
            { label: 'Query rewrite', value: t.rewriteMs === undefined ? unavailable : fmtMs(t.rewriteMs) },
            { label: 'Embedding', value: t.embeddingMs === undefined ? unavailable : fmtMs(t.embeddingMs) },
            { label: 'Search + re-rank', value: t.searchMs === undefined ? unavailable : fmtMs(t.searchMs) },
          ]}
        />
      </Section>

      <Section title="Tokens and cost">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-widest text-neutral-400">
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-2 pr-4 font-normal">Stage</th>
                <th className="py-2 pr-4 font-normal">Model</th>
                <th className="py-2 pr-4 text-right font-normal">Input</th>
                <th className="py-2 pr-4 text-right font-normal">Output</th>
                <th className="py-2 text-right font-normal">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((s) => {
                const u = r.usage[s]
                return (
                  <tr key={s} className="border-b border-neutral-100 dark:border-neutral-900">
                    <td className="py-2 pr-4">{STAGE_LABEL[s]}</td>
                    <td className="py-2 pr-4 text-neutral-500">{r.stageModels?.[s] ?? unavailable}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {u?.inputTokens === undefined ? unavailable : fmtInt(u.inputTokens)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {u?.outputTokens === undefined ? (s === 'embedding' && u ? '—' : unavailable) : fmtInt(u.outputTokens)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.costBreakdownUsd?.[s] === undefined ? unavailable : fmtUsd(r.costBreakdownUsd[s])}
                    </td>
                  </tr>
                )
              })}
              <tr className="font-medium">
                <td className="py-2 pr-4">Total</td>
                <td />
                <td className="py-2 pr-4 text-right tabular-nums">{totalIn === undefined ? unavailable : fmtInt(totalIn)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{totalOut === undefined ? unavailable : fmtInt(totalOut)}</td>
                <td className="py-2 text-right tabular-nums">
                  {r.estimatedCostUsd === undefined ? unavailable : fmtUsd(r.estimatedCostUsd)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-400">
          Cost is an estimate{r.pricingVersion ? ` (pricing ${r.pricingVersion})` : ''}. Stages without reported usage
          are not counted as zero.
        </p>
      </Section>

      <Section title="Retrieved chunks">
        {r.chunks.length === 0 ? (
          <p className="text-neutral-400">No chunks were selected for this query.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-widest text-neutral-400">
                  <tr className="border-b border-neutral-200 dark:border-neutral-800">
                    <th className="py-2 pr-4 font-normal">#</th>
                    <th className="py-2 pr-4 font-normal">Post</th>
                    <th className="py-2 pr-4 font-normal">Chunk</th>
                    <th className="py-2 pr-4 text-right font-normal">Hybrid score</th>
                    <th className="py-2 font-normal">Found by</th>
                  </tr>
                </thead>
                <tbody>
                  {r.chunks.map((c) => (
                    <tr key={c.chunkId} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                      <td className="py-2 pr-4 tabular-nums text-neutral-500">{c.rank}</td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/blog/${c.slug}`}
                          className="underline-offset-4 decoration-neutral-300 hover:underline dark:decoration-neutral-600"
                        >
                          {c.slug}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-neutral-500">{c.chunkId}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.hybridScore === undefined ? unavailable : c.hybridScore.toFixed(3)}
                      </td>
                      <td className="py-2 text-neutral-500">{c.sources ?? unavailable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Order is the final position after re-ranking
              {r.candidateCount !== undefined ? ` (from ${r.candidateCount} candidates)` : ''}. Hybrid scores are
              relative ranking scores (semantic + keyword, normalised) computed before re-ranking, so they may not
              descend. They are not probabilities or answer confidence.
            </p>
          </>
        )}
      </Section>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/admin"
      className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      ← Back to dashboard
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs uppercase tracking-widest text-neutral-400">{title}</h2>
      {children}
    </section>
  )
}

function Grid({ items }: { items: { label: string; value: React.ReactNode; note?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs text-neutral-400">{i.label}</dt>
          <dd className="mt-1 font-semibold tabular-nums">{i.value}</dd>
          {i.note && <p className="text-xs text-neutral-400">{i.note}</p>}
        </div>
      ))}
    </dl>
  )
}
