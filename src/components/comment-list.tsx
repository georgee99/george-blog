'use client'

import { useEffect, useState } from 'react'

interface Comment {
  id: string
  author_name: string
  body: string
  created_at: string
}

interface CommentListProps {
  postSlug: string
}

export default function CommentList({ postSlug }: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/comments?postSlug=${encodeURIComponent(postSlug)}`)
      .then((res) => res.json())
      .then((data) => setComments(data.comments ?? []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false))
  }, [postSlug])

  if (loading) {
    return (
      <div className="mt-10 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
        ))}
      </div>
    )
  }

  if (comments.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Comments
      </h2>
      <ul className="space-y-6">
        {comments.map((comment) => (
          <li key={comment.id} className="border-b border-neutral-100 pb-6 last:border-0 dark:border-neutral-800">
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {comment.author_name}
              </span>
              <time className="shrink-0 text-xs text-neutral-400" dateTime={comment.created_at}>
                {new Date(comment.created_at).toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {comment.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
