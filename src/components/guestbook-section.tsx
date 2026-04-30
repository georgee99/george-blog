'use client'

import { useCallback, useEffect, useId, useState } from 'react'

interface GuestbookEntry {
  commentId: string
  author: string
  content: string
  createdAt: string
}

function getOrCreateClientId(): string {
  const key = 'blog_client_id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  localStorage.setItem(key, id)
  return id
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function GuestbookSection() {
  const uid = useId()
  const [entries, setEntries] = useState<GuestbookEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [authorName, setAuthorName] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const fetchEntries = useCallback(() => {
    fetch('/api/comments?postSlug=guestbook')
      .then((res) => res.json())
      .then((data) => setEntries(data.comments ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoadingEntries(false))
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postSlug: 'guestbook',
          authorName: authorName.trim(),
          body: message.trim(),
          clientId: getOrCreateClientId(),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Request failed (${res.status})`)
      }

      const newEntry: GuestbookEntry = {
        commentId: `optimistic-${Date.now()}`,
        author: authorName.trim(),
        content: message.trim(),
        createdAt: new Date().toISOString(),
      }
      setEntries((prev) => [newEntry, ...prev])
      setStatus('idle')
      setAuthorName('')
      setMessage('')
      fetchEntries()
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="space-y-10">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor={`${uid}-name`}
            className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
          >
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            required
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={100}
            placeholder="Your name"
            className="w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:focus:border-neutral-400"
          />
        </div>

        <div>
          <label
            htmlFor={`${uid}-message`}
            className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
          >
            Message <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${uid}-message`}
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Leave a message…"
            className="w-full resize-y rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:focus:border-neutral-400"
          />
        </div>

        {status === 'error' && (
          <p role="alert" className="text-sm text-red-500 dark:text-red-400">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'loading' || !authorName.trim() || !message.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {status === 'loading' ? 'Signing…' : 'Sign'}
        </button>
      </form>

      {loadingEntries ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      ) : entries.length > 0 ? (
        <ul className="space-y-5">
          {entries.map((entry) => (
            <li
              key={entry.commentId}
              className="border-b border-neutral-100 pb-5 last:border-0 dark:border-neutral-800"
            >
              <div className="mb-1 flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {entry.author}
                </span>
                <time className="shrink-0 text-xs text-neutral-400" dateTime={entry.createdAt}>
                  {formatDate(entry.createdAt)}
                </time>
              </div>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {entry.content}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
