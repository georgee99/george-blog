'use client'

import { useState } from 'react'

interface CommentFormProps {
  postSlug: string
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function CommentForm({ postSlug }: CommentFormProps) {
  const [authorName, setAuthorName] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postSlug, authorName: authorName.trim(), body: body.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Request failed (${res.status})`)
      }

      setStatus('success')
      setAuthorName('')
      setBody('')
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <section className="mt-16 border-t border-neutral-200 pt-10 dark:border-neutral-800">
      <h2 className="mb-6 text-sm font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Leave a comment
      </h2>

      {status === 'success' ? (
        <p className="text-sm text-green-600 dark:text-green-400">
          Thanks for your comment!
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="authorName"
              className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
            >
              Name <span aria-hidden="true">*</span>
            </label>
            <input
              id="authorName"
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
              htmlFor="body"
              className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
            >
              Comment <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="body"
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Write your comment…"
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
            disabled={status === 'loading' || !authorName.trim() || !body.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {status === 'loading' ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      )}
    </section>
  )
}
