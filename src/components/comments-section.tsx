'use client'

import { useCallback, useEffect, useState } from 'react'
import CommentForm from './comment-form'
import CommentList, { Comment } from './comment-list'

interface CommentsSectionProps {
  postSlug: string
}

export default function CommentsSection({ postSlug }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  const fetchComments = useCallback(() => {
    fetch(`/api/comments?postSlug=${encodeURIComponent(postSlug)}`)
      .then((res) => res.json())
      .then((data) => setComments(data.comments ?? []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false))
  }, [postSlug])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  return (
    <>
      <CommentForm postSlug={postSlug} onSuccess={fetchComments} />
      <CommentList
        postSlug={postSlug}
        comments={comments}
        loading={loading}
        onRefetch={fetchComments}
      />
    </>
  )
}
