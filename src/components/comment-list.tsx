'use client'

import { useState } from 'react'
import CommentForm from './comment-form'
import ReactionBar from './reaction-bar'

export interface Comment {
  commentId: string
  author: string
  content: string
  createdAt: string
  parentId?: string
  reactions?: Record<string, number>
}

interface CommentThread {
  comment: Comment
  replies: Comment[]
}

interface CommentListProps {
  postSlug: string
  comments: Comment[]
  loading: boolean
  onRefetch: () => void
}

function buildThreads(comments: Comment[]): CommentThread[] {
  const topLevel = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // newest first

  return topLevel.map((comment) => ({
    comment,
    replies: comments
      .filter((c) => c.parentId === comment.commentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)), // oldest first
  }))
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function CommentList({ postSlug, comments, loading, onRefetch }: CommentListProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="mt-10 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
        ))}
      </div>
    )
  }

  const threads = buildThreads(comments)

  if (threads.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Comments
      </h2>
      <ul className="space-y-6">
        {threads.map(({ comment, replies }) => (
          <li key={comment.commentId} className="border-b border-neutral-100 pb-6 last:border-0 dark:border-neutral-800">
            {/* Top-level comment */}
            <div className="mb-1 flex items-baseline justify-between gap-4">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {comment.author}
              </span>
              <time className="shrink-0 text-xs text-neutral-400" dateTime={comment.createdAt}>
                {formatDate(comment.createdAt)}
              </time>
            </div>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {comment.content}
            </p>

            <ReactionBar postSlug={postSlug} commentId={comment.commentId} reactions={comment.reactions} />

            {/* Reply button */}
            {replyingTo !== comment.commentId && (
              <button
                onClick={() => setReplyingTo(comment.commentId)}
                className="mt-2 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                Reply
              </button>
            )}

            {/* Inline reply form */}
            {replyingTo === comment.commentId && (
              <div className="mt-4">
                <CommentForm
                  postSlug={postSlug}
                  parentId={comment.commentId}
                  compact
                  onSuccess={() => {
                    setReplyingTo(null)
                    onRefetch()
                  }}
                  onCancel={() => setReplyingTo(null)}
                />
              </div>
            )}

            {/* Replies */}
            {replies.length > 0 && (
              <ul className="mt-4 space-y-4 border-l-2 border-neutral-100 pl-4 dark:border-neutral-800">
                {replies.map((reply) => (
                  <li key={reply.commentId}>
                    <div className="mb-1 flex items-baseline justify-between gap-4">
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {reply.author}
                      </span>
                      <time className="shrink-0 text-xs text-neutral-400" dateTime={reply.createdAt}>
                        {formatDate(reply.createdAt)}
                      </time>
                    </div>
                    <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {reply.content}
                    </p>
                    <ReactionBar postSlug={postSlug} commentId={reply.commentId} reactions={reply.reactions} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
