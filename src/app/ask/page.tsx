'use client'

import { useState, useRef } from 'react'

export default function AskPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    setLoading(true)
    setAnswer(null)
    setError(null)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })

      const data = (await res.json()) as { answer?: string; error?: string }
      console.log('[ask] response:', data)

      if (!res.ok || data.error) {
        setError(data.error ?? 'Something went wrong.')
      } else {
        setAnswer(data.answer ?? null)
      }
    } catch {
      setError('Failed to reach the server.')
    } finally {
      setLoading(false)
    }
  }

  const exampleQuestions = [
    'What have you written about AWS?',
    'Do you prefer NoSQL or SQL?',
    'What coffee shops do you recommend?',
    'What do you think of Spiderman?',
  ]

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask george</h1>
        <p className="mt-3 leading-relaxed text-neutral-600 dark:text-neutral-400">
            Ask me anything you want mmmmm &#128521;
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          ref={inputRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
          placeholder="What have you written about AWS costs?"
          maxLength={500}
          rows={3}
          className="w-full resize-none rounded-none border border-neutral-200 bg-transparent px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-neutral-100"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">{question.length}/500</span>
          <button
            type="submit"
            disabled={!question.trim() || loading}
            className="bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </form>

      {/* Example questions */}
      {!answer && !loading && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-neutral-400">Try asking</p>
          <div className="flex flex-wrap gap-2">
            {exampleQuestions.map(q => (
              <button
                key={q}
                onClick={() => setQuestion(q)}
                className="border border-neutral-200 px-3 py-1 text-sm text-neutral-600 transition-colors hover:border-neutral-900 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-100 dark:hover:text-neutral-100"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div className="space-y-2 border-l-2 border-neutral-900 pl-4 dark:border-neutral-100">
          <p className="text-xs uppercase tracking-widest text-neutral-400">Answer</p>
          <div className="space-y-3 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
            {answer}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}
