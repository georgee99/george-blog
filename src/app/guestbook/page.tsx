import GuestbookSection from '@/components/guestbook-section'
import { type Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Guestbook',
  description: 'Leave a message',
}

export default function GuestbookPage() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guestbook</h1>
        <p className="mt-3 leading-relaxed text-neutral-600 dark:text-neutral-400">
          Leave a message, plz be nice.
        </p>
      </div>
      <GuestbookSection />
    </div>
  )
}
