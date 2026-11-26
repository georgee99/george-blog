import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/auth'
import { getAdminSession } from '@/lib/admin-auth'
import { AccessDenied } from '@/components/admin-access'
import { Chart } from '@/components/admin-chart'
import { fetchQueries, fetchSummary, type SummaryResponse } from '@/lib/rag-analytics/admin-client'
import {
  MAX_RANGE_DAYS,
  addDays,
  fmtInt,
  fmtMs,
  fmtPct,
  fmtTimestamp,
  fmtUsd,
  rangeDays,
  resolveRange,
  todaySydney,
} from '@/lib/rag-analytics/format'

export const dynamic = 'force-dynamic'

type SearchParams = { from?: string; to?: string; status?: string; feedback?: string; cursor?: string; prev?: string | string[] }

const pill =
  'px-3 py-1 rounded-full text-xs border transition-colors border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200'
const pillActive =
  'px-3 py-1 rounded-full text-xs border bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100'
const dateInput =
  'mt-1 block border border-neutral-200 bg-transparent px-3 py-1.5 text-sm normal-case tracking-normal text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:text-neutral-100 dark:focus:border-neutral-100'

function href(params: Record<string, string | string[] | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((value) => q.append(k, value))
    else if (v) q.set(k, v)
  }
  const s = q.toString()
  return s ? `/admin/rag?${s}` : '/admin/rag'
}

export default async function RagAnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const admin = await getAdminSession()
  if (!admin) return <AccessDenied />

  const sp = await searchParams
  const { from, to } = resolveRange(sp.from, sp.to)
  const status: 'success' | 'failure' | undefined =
    sp.status === 'success' || sp.status === 'failure' ? sp.status : undefined
  const feedback: 'up' | 'down' | undefined = sp.feedback === 'up' || sp.feedback === 'down' ? sp.feedback : undefined
  const cursor = sp.cursor?.slice(0, 2000)
  const previous = (Array.isArray(sp.prev) ? sp.prev : sp.prev ? [sp.prev] : [])
    .filter((value) => value === 'first' || /^[A-Za-z0-9_-]{1,2000}$/.test(value))
  const tooWide = rangeDays(from, to) > MAX_RANGE_DAYS
  const filters = { from, to, ...(status ? { status } : {}), ...(feedback ? { feedback } : {}) }

  const [summary, queries] = tooWide
    ? [null, null]
    : await Promise.all([fetchSummary(filters), fetchQueries({ ...filters, limit: 15, cursor })])

  const base = { from, to, status, feedback }
  const today = todaySydney()
  const presets = [
    { label: '2d', from: addDays(today, -1) },
    { label: '7d', from: addDays(today, -6) },
    { label: '30d', from: addDays(today, -29) },
  ]
  const activePreset = to === today ? presets.find((p) => p.from === from)?.label : undefined

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">RAG analytics</h1>
        <LogoutButton />
      </div>
      <Link href="/admin" className="text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400">
        ← Admin home
      </Link>

      <form method="get" action="/admin/rag" className="space-y-4">
        <p className="text-xs text-neutral-500">Dates and daily totals use Sydney time (AEST/AEDT).</p>
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <Link
              key={p.label}
              href={href({ from: p.from, to: today, status, feedback })}
              className={activePreset === p.label ? pillActive : pill}
            >
              {p.label}
            </Link>
          ))}
          <span className="mx-1 text-neutral-300 dark:text-neutral-700">|</span>
          {[
            { label: 'all', value: undefined },
            { label: 'success', value: 'success' },
            { label: 'failed', value: 'failure' },
          ].map((s) => (
            <Link
              key={s.label}
              href={href({ from, to, status: s.value, feedback })}
              className={status === s.value ? pillActive : pill}
            >
              {s.label}
            </Link>
          ))}
          <span className="mx-1 text-neutral-300 dark:text-neutral-700">|</span>
          {[
            { label: 'all ratings', value: undefined },
            { label: '👍 positive', value: 'up' },
            { label: '👎 negative', value: 'down' },
          ].map((f) => (
            <Link key={f.label} href={href({ from, to, status, feedback: f.value })} className={feedback === f.value ? pillActive : pill}>
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs uppercase tracking-widest text-neutral-400">
            From
            <input type="date" name="from" defaultValue={from} className={dateInput} />
          </label>
          <label className="text-xs uppercase tracking-widest text-neutral-400">
            To
            <input type="date" name="to" defaultValue={to} className={dateInput} />
          </label>
          {status && <input type="hidden" name="status" value={status} />}
          {feedback && <input type="hidden" name="feedback" value={feedback} />}
          <button
            type="submit"
            className="bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Apply
          </button>
        </div>
      </form>

      {tooWide ? (
        <Notice>Date range cannot exceed {MAX_RANGE_DAYS} days.</Notice>
      ) : !summary?.ok ? (
        <Notice tone="error">{summary?.error ?? 'Something went wrong.'}</Notice>
      ) : (
        <>
          <Overview data={summary.data} />
          <section className="grid gap-8 sm:grid-cols-2">
            <Chart
              title="Queries per day"
              kind="bar"
              points={summary.data.daily.map((d) => ({ label: d.day, value: d.queries }))}
              format={fmtInt}
            />
            <Chart
              title="Avg latency per day"
              kind="line"
              points={summary.data.daily.map((d) => ({ label: d.day, value: d.avgTotalMs }))}
              format={fmtMs}
            />
            <Chart
              title="Tokens per day"
              kind="bar"
              points={summary.data.daily.map((d) => ({ label: d.day, value: d.inputTokens + d.outputTokens }))}
              format={fmtInt}
            />
            <Chart
              title="Estimated cost per day"
              kind="bar"
              points={summary.data.daily.map((d) => ({ label: d.day, value: d.estimatedCostUsd }))}
              format={fmtUsd}
            />
          </section>
        </>
      )}

      {!tooWide && (
        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-widest text-neutral-400">Recent queries</h2>
          {!queries?.ok ? (
            <Notice tone="error">{queries?.error ?? 'Something went wrong.'}</Notice>
          ) : (
            <>
              {queries.data.items.length === 0 ? (
                <p className="text-neutral-400">{cursor ? 'No more queries' : 'No queries in this range'}</p>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-widest text-neutral-400">
                    <tr className="border-b border-neutral-200 dark:border-neutral-800">
                      <th className="py-2 pr-4 font-normal">Time (Sydney)</th>
                      <th className="py-2 pr-4 font-normal">Query</th>
                      <th className="py-2 pr-4 font-normal">Model</th>
                      <th className="py-2 pr-4 font-normal">Method</th>
                      <th className="py-2 pr-4 text-right font-normal">Latency</th>
                      <th className="py-2 pr-4 font-normal">Status</th>
                      <th className="py-2 pr-4 font-normal">Feedback</th>
                      <th className="py-2 text-right font-normal">Chunks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queries.data.items.map((q) => (
                      <tr key={q.queryId} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                        <td className="whitespace-nowrap py-3 pr-4">
                          <Link
                            href={`/admin/queries/${q.queryId}`}
                            className="text-neutral-500 underline-offset-4 decoration-neutral-300 hover:text-neutral-900 hover:underline dark:decoration-neutral-600 dark:hover:text-neutral-100"
                          >
                            {fmtTimestamp(q.timestamp)}
                          </Link>
                        </td>
                        <td className="max-w-[16rem] py-3 pr-4 text-neutral-900 dark:text-neutral-100">
                          {q.queryText ? (
                            <span className="line-clamp-2 break-words">{q.queryText}</span>
                          ) : (
                            <span className="text-neutral-400">not retained</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-neutral-500">{q.model}</td>
                        <td className="whitespace-nowrap py-3 pr-4 text-neutral-500">{q.retrievalMethod}</td>
                        <td className="whitespace-nowrap py-3 pr-4 text-right tabular-nums">{fmtMs(q.totalMs)}</td>
                        <td className="whitespace-nowrap py-3 pr-4">
                          {q.status === 'success' ? (
                            <span className="text-neutral-500">success</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">
                              failed{q.errorCategory ? ` · ${q.errorCategory}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4">{q.feedback === 'down' ? <span className="font-semibold text-red-600 dark:text-red-400">👎 Negative</span> : q.feedback === 'up' ? '👍 Positive' : '—'}</td>
                        <td className="py-3 text-right tabular-nums">{q.chunkCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
              <div className="flex items-center justify-between">
                {cursor ? (
                  <div className="flex gap-2">
                    <Link href={href(base)} className={pill}>← Newest</Link>
                    {previous.length > 0 && (
                      <Link href={href({
                        ...base,
                        cursor: previous[previous.length - 1] === 'first' ? undefined : previous[previous.length - 1],
                        prev: previous.slice(0, -1),
                      })} className={pill}>← Previous</Link>
                    )}
                  </div>
                ) : (
                  <span />
                )}
                {queries.data.nextCursor ? (
                  <Link href={href({ ...base, cursor: queries.data.nextCursor, prev: [...previous, cursor ?? 'first'] })} className={pill}>
                    Older →
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}

function Overview({ data }: { data: SummaryResponse }) {
  const t = data.totals
  const stats: { label: string; value: string; note?: string }[] = [
    { label: 'Queries', value: fmtInt(t.queries) },
    { label: 'Successful', value: fmtInt(t.success) },
    { label: 'Failed', value: fmtInt(t.failure) },
    { label: 'Positive feedback', value: fmtInt(t.positiveFeedback ?? 0) },
    { label: 'Negative feedback', value: fmtInt(t.negativeFeedback ?? 0) },
    { label: 'Failure rate', value: fmtPct(t.failureRate) },
    { label: 'Avg latency', value: fmtMs(t.avgTotalMs) },
    { label: 'p95 latency', value: fmtMs(t.p95TotalMs) },
    { label: 'Avg retrieval', value: fmtMs(t.avgRetrievalMs), note: 'rewrite + embed + search' },
    { label: 'Avg generation', value: fmtMs(t.avgGenerationMs) },
    {
      label: 'Input tokens',
      value: fmtInt(t.inputTokens),
      note: t.queriesWithUsage < t.queries ? `${t.queriesWithUsage}/${t.queries} queries reported` : undefined,
    },
    { label: 'Output tokens', value: fmtInt(t.outputTokens) },
    {
      label: 'Est. cost',
      value: fmtUsd(t.estimatedCostUsd),
      note: t.queriesWithCost < t.queries ? `${t.queriesWithCost}/${t.queries} queries priced` : 'estimate',
    },
  ]

  return (
    <section className="space-y-4">
      <h2 className="text-xs uppercase tracking-widest text-neutral-400">Overview</h2>
      {t.queries === 0 ? (
        <p className="text-neutral-400">No queries in this range</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-neutral-400">{s.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{s.value}</dd>
              {s.note && <p className="text-xs text-neutral-400">{s.note}</p>}
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`text-sm ${tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-neutral-500'}`}
    >
      {children}
    </p>
  )
}

function LogoutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/admin/login' })
      }}
    >
      <button
        type="submit"
        className="border border-neutral-300 px-4 py-2 text-sm transition-opacity hover:opacity-80 dark:border-neutral-700"
      >
        Sign out
      </button>
    </form>
  )
}
