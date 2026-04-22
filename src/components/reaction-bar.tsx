'use client'

import { useEffect, useRef, useState } from 'react'

export const REACTIONS = ['👍', '👎', '❤️', '😢', '😡']

interface ReactionBarProps {
  postSlug: string
  commentId: string
  reactions?: Record<string, number>
}

export default function ReactionBar({ postSlug, commentId, reactions: initialReactions }: ReactionBarProps) {
  const [reactions, setReactions] = useState<Record<string, number>>(initialReactions ?? {})
  const [reacted, setReacted] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const stored = new Set<string>()
    REACTIONS.forEach((emoji) => {
      if (localStorage.getItem(`reaction:${commentId}:${emoji}`)) stored.add(emoji)
    })
    return stored
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  const callEmojiApi = async (emoji: string, action: 'add' | 'remove') => {
    await fetch('/api/comments/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postSlug, commentId, emoji, action }),
    })
  }

  const reactEmoji = async (emoji: string) => {
    if (reacted.has(emoji)) return
    setReactions((prev) => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }))
    setReacted((prev) => new Set([...prev, emoji]))
    localStorage.setItem(`reaction:${commentId}:${emoji}`, '1')
    try {
      await callEmojiApi(emoji, 'add')
    } catch {
      setReactions((prev) => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] ?? 1) - 1) }))
      setReacted((prev) => { const next = new Set(prev); next.delete(emoji); return next })
      localStorage.removeItem(`reaction:${commentId}:${emoji}`)
    }
  }

  const unreactEmoji = async (emoji: string) => {
    if (!reacted.has(emoji)) return
    setReactions((prev) => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] ?? 1) - 1) }))
    setReacted((prev) => { const next = new Set(prev); next.delete(emoji); return next })
    localStorage.removeItem(`reaction:${commentId}:${emoji}`)
    try {
      await callEmojiApi(emoji, 'remove')
    } catch {
      setReactions((prev) => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }))
      setReacted((prev) => new Set([...prev, emoji]))
      localStorage.setItem(`reaction:${commentId}:${emoji}`, '1')
    }
  }

  const handlePickerClick = (emoji: string) => {
    setPickerOpen(false)
    if (reacted.has(emoji)) {
      unreactEmoji(emoji)
    } else {
      reactEmoji(emoji)
    }
  }

  const activePills = REACTIONS.filter((e) => (reactions[e] ?? 0) > 0 || reacted.has(e))

  return (
    <div className="relative mt-2 flex flex-wrap items-center gap-1.5">
      {activePills.map((emoji) => {
        const count = reactions[emoji] ?? 0
        const hasReacted = reacted.has(emoji)
        return (
          <button
            key={emoji}
            onClick={() => hasReacted ? unreactEmoji(emoji) : reactEmoji(emoji)}
            title={hasReacted ? 'Remove reaction' : undefined}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
              hasReacted
                ? 'border-neutral-400 bg-neutral-100 text-neutral-700 dark:border-neutral-500 dark:bg-neutral-800 dark:text-neutral-300'
                : 'border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        )
      })}

      {/* Picker */}
      <div ref={pickerRef} className="relative">
        <button
          onClick={() => setPickerOpen((p) => !p)}
          aria-label="Add reaction"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 text-xs text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-600 dark:border-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:text-neutral-300"
        >
          +
        </button>
        {pickerOpen && (
          <div className="absolute bottom-full left-0 mb-1.5 flex gap-1 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-md dark:border-neutral-700 dark:bg-neutral-900">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handlePickerClick(emoji)}
                className={`rounded px-1.5 py-1 text-base transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  reacted.has(emoji) ? 'opacity-40' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
