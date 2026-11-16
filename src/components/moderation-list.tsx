'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { ModerationPage, ModerationEntry } from '@/lib/moderation/admin-client'

type EntryType = 'all' | 'blog' | 'guestbook'
type EntryStatus = 'all' | 'visible' | 'hidden'
type SortOrder = 'newest' | 'oldest'
type Action = 'hide' | 'restore' | 'delete'

const input = 'moderation-filter mt-1 block rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 scheme-light dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:scheme-dark'
const option = 'bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
const button = 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300'

export default function ModerationList({ titles }: { titles: Record<string, string> }) {
  const [type, setType] = useState<EntryType>('all')
  const [status, setStatus] = useState<EntryStatus>('all')
  const [sort, setSort] = useState<SortOrder>('newest')
  const [selectedBlogs, setSelectedBlogs] = useState<string[]>([])
  const [availableBlogs, setAvailableBlogs] = useState<string[]>([])
  const [blogSearch, setBlogSearch] = useState('')
  const [showBlogs, setShowBlogs] = useState(false)
  const [cursors, setCursors] = useState<string[]>([''])
  const [page, setPage] = useState<ModerationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const cursor = cursors[cursors.length - 1]

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ type, status, sort })
    if (selectedBlogs.length) params.set('blogs', JSON.stringify(selectedBlogs))
    if (cursor) params.set('cursor', cursor)
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/admin/moderation?${params}`, { cache: 'no-store', signal: controller.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
        if (selectedBlogs.length && !Array.isArray(data.availableBlogs)) {
          throw new Error('The moderation service must be updated before filtering by blog.')
        }
        if (Array.isArray(data.availableBlogs)) {
          setAvailableBlogs(data.availableBlogs.filter((slug: unknown): slug is string => typeof slug === 'string'))
        }
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
  }, [type, status, sort, selectedBlogs, cursor, refresh])

  const blogOptions = [...new Set([...Object.keys(titles), ...availableBlogs])]
    .sort((a, b) => (titles[a] ?? a).localeCompare(titles[b] ?? b) || a.localeCompare(b))
  const search = blogSearch.trim().toLocaleLowerCase()
  const visibleBlogs = blogOptions.filter((slug) =>
    `${titles[slug] ?? slug} ${slug}`.toLocaleLowerCase().includes(search))

  const toggleBlog = (slug: string) => {
    setSelectedBlogs((current) =>
      current.includes(slug) ? current.filter((value) => value !== slug) : [...current, slug].sort())
    if (type === 'guestbook') setType('blog')
    setCursors([''])
  }

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
            const nextType = e.target.value as EntryType
            setType(nextType)
            if (nextType === 'guestbook') setSelectedBlogs([])
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
        <label className="text-xs uppercase tracking-widest text-neutral-400">
          Date
          <select className={input} value={sort} onChange={(e) => {
            setSort(e.target.value as SortOrder)
            setCursors([''])
          }}>
            <option className={option} value="newest">Newest to oldest</option>
            <option className={option} value="oldest">Oldest to newest</option>
          </select>
        </label>
      </div>
      <section aria-label="Blog filter" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={button} aria-expanded={showBlogs}
            aria-controls="moderation-blog-options" onClick={() => setShowBlogs((open) => !open)}>
            {showBlogs ? 'Close blog filter' : 'Filter by blog'}
            {selectedBlogs.length > 0 ? ` (${selectedBlogs.length} selected)` : ''}
          </button>
          {selectedBlogs.length > 0 && (
            <button type="button" className="text-sm text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100"
              onClick={() => { setSelectedBlogs([]); setCursors(['']) }}>
              Clear blogs
            </button>
          )}
        </div>
        {selectedBlogs.length > 0 && (
          <ul aria-label="Selected blogs" className="flex flex-wrap gap-2">
            {selectedBlogs.map((slug) => (
              <li key={slug}>
                <button type="button" onClick={() => toggleBlog(slug)}
                  aria-label={`Remove ${titles[slug] ?? slug} from blog filter`}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300">
                  {titles[slug] ?? slug} <span aria-hidden="true">&times;</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div id="moderation-blog-options" hidden={!showBlogs} className="space-y-3 border border-neutral-200 p-4 dark:border-neutral-800">
          <label className="block text-xs uppercase tracking-widest text-neutral-400">
            Search blogs
            <input type="search" value={blogSearch} onChange={(e) => setBlogSearch(e.target.value)}
              placeholder="Search by title or slug"
              className="mt-2 block w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm normal-case tracking-normal text-neutral-900 dark:border-neutral-700 dark:text-neutral-100" />
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Select one or more blogs. Guestbook entries are excluded while blogs are selected.
          </p>
          {visibleBlogs.length === 0 ? (
            <p className="text-sm text-neutral-500">No matching blogs.</p>
          ) : (
            <fieldset className="max-h-56 space-y-1 overflow-y-auto">
              <legend className="sr-only">Blogs</legend>
              {visibleBlogs.map((slug) => (
                <label key={slug} className="flex cursor-pointer items-start gap-3 rounded px-2 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <input type="checkbox" className="mt-1 accent-neutral-900 dark:accent-neutral-300"
                    checked={selectedBlogs.includes(slug)} onChange={() => toggleBlog(slug)} />
                  <span className="break-words">{titles[slug] ?? slug}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      </section>
      <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        Status reflects each entry&apos;s own setting. Replies of a hidden parent are also hidden publicly,
        even if their own status is visible.
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
