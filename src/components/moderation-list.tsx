'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { ModerationPage, ModerationEntry } from '@/lib/moderation/admin-client'

type EntryType = 'all' | 'blog' | 'guestbook'
type EntryStatus = 'all' | 'visible' | 'hidden'
type Action = 'hide' | 'restore' | 'delete'

const input = 'moderation-filter mt-1 block rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 scheme-light dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:scheme-dark'
const option = 'bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
const button = 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300'

export default function ModerationList({ titles }: { titles: Record<string, string> }) {
  const [type, setType] = useState<EntryType>('all')
  const [status, setStatus] = useState<EntryStatus>('all')
  const [cursors, setCursors] = useState<string[]>([''])
  const [page, setPage] = useState<ModerationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const cursor = cursors[cursors.length - 1]

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ type, status })
    if (cursor) params.set('cursor', cursor)
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/admin/moderation?${params}`, { cache: 'no-store', signal: controller.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
        setPage(data as ModerationPage)
      } catch (err) {
        if (!controller.signal.aborted) {
          setPage(null)
          setError(err instanceof Error ? err.message : 'Could not load entries.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [type, status, cursor, refresh])

  const act = useCallback(async (entry: ModerationEntry, action: Action) => {
    if (action === 'delete' && !window.confirm(
      'Permanently delete this entry? This cannot be undone. Entries with replies cannot be deleted until their replies are deleted.',
    )) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postSlug: entry.postSlug, commentId: entry.commentId, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update entry.')
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <label className="text-xs uppercase tracking-widest text-neutral-400">
          Type
          <select className={input} value={type} onChange={(e) => {
            setType(e.target.value as EntryType)
            setCursors([''])
          }}>
            <option className={option} value="all">All entries</option>
            <option className={option} value="blog">Blog comments</option>
            <option className={option} value="guestbook">Guestbook</option>
          </select>
        </label>
        <label className="text-xs uppercase tracking-widest text-neutral-400">
          Status
          <select className={input} value={status} onChange={(e) => {
            setStatus(e.target.value as EntryStatus)
            setCursors([''])
          }}>
            <option className={option} value="all">All statuses</option>
            <option className={option} value="visible">Visible</option>
            <option className={option} value="hidden">Hidden</option>
          </select>
        </label>
      </div>
      <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        Status reflects each entry&apos;s own setting. Replies of a hidden parent are also hidden publicly,
        even if their own status is visible. Results are sorted by date within each page, not across pages.
      </p>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-neutral-400">Loading entries...</p>
      ) : page && page.items.length === 0 ? (
        <p className="text-sm text-neutral-400">No matching entries on this page.</p>
      ) : (
        <ul className="space-y-5">
          {page?.items.map((entry) => (
            <li key={`${entry.postSlug}#${entry.commentId}`} className="space-y-2 border-b border-neutral-200 pb-5 dark:border-neutral-800">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{entry.author}</span>
                <time className="text-xs text-neutral-400" dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString('en-AU')}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-neutral-600 dark:text-neutral-400">{entry.content}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {entry.postSlug === 'guestbook' ? 'Guestbook' : (
                  <>Blog: <Link className="underline" href={`/blog/${encodeURIComponent(entry.postSlug)}`}>{titles[entry.postSlug] ?? entry.postSlug}</Link></>
                )}
                {' · '}{entry.isHidden ? 'Hidden' : 'Visible'}{entry.parentId ? ' · Reply' : ''}
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} className={button} onClick={() => void act(entry, entry.isHidden ? 'restore' : 'hide')}>
                  {entry.isHidden ? 'Restore' : 'Hide'}
                </button>
                <button type="button" disabled={busy} className={button} onClick={() => void act(entry, 'delete')}>
                  Delete permanently
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button type="button" className={button} disabled={loading || busy || cursors.length === 1}
          onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</button>
        <span className="text-xs text-neutral-400">Page {cursors.length}</span>
        <button type="button" className={button} disabled={loading || busy || !page?.nextCursor}
          onClick={() => { if (page?.nextCursor) setCursors((current) => [...current, page.nextCursor!]) }}>Next</button>
      </div>
    </div>
  )
}
