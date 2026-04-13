'use client'

import { useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface SubscribeFormProps {
  source: string
}

export default function SubscribeForm({ source }: SubscribeFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`)
      }

      setStatus('success')
      setEmail('')
      setMessage(data.message ?? 'Check your email to confirm your subscription.')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <section className="border-t border-neutral-200 pt-8 dark:border-neutral-800">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Stay updated
      </h2>

      {status === 'success' ? (
        <p className="text-sm text-green-600 dark:text-green-400">{message}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2" noValidate>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:focus:border-neutral-400"
          />
          <button
            type="submit"
            disabled={status === 'loading' || !email.trim()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
          </button>
        </form>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-red-500 dark:text-red-400">
          {message}
        </p>
      )}
    </section>
  )
}
