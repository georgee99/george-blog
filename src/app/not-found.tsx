import Link from 'next/link'
import Image from 'next/image'
import { type Metadata } from 'next'

export const metadata: Metadata = {
  title: '404 Womp Womp',
}

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="max-w-md space-y-6">
        <div className="flex justify-center">
          <Image
            src="/meow/S_M_1.png"
            alt="Lost cats"
            width={300}
            height={300}
          />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>

        <p className="leading-relaxed text-neutral-600 dark:text-neutral-400">
          Whatever you were looking for isn&apos;t here. It may have moved, or never existed in the first place.
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
            Read my blogs
          </Link>
        </div>
      </div>
    </div>
  )
}
