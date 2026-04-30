import Link from 'next/link'
import Image from 'next/image'
import { type Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Subscription Confirmed',
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; message?: string }>
}) {
  const { status, message } = await searchParams
  const isSuccess = status === 'success'

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="max-w-md space-y-6">
        <div className="flex justify-center">
          <Image
            src={isSuccess ? '/meow/M14.png' : '/meow/S15.png'}
            alt={isSuccess ? 'Celebration' : 'Something went wrong'}
            width={160}
            height={160}
          />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {isSuccess ? "Welcome my dude" : 'Something went wrong'}
        </h1>

        <p className="leading-relaxed text-neutral-600 dark:text-neutral-400">
          {isSuccess
            ? "You'll get an email whenever I publish something new."
            : (message ?? 'We couldn\'t confirm your subscription. The link may have expired or already been used.')}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Go home
          </Link>
          <Link
            href="/blog"
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Read the blog
          </Link>
        </div>
      </div>
    </div>
  )
}
