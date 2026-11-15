import Link from 'next/link'
import { signOut } from '@/auth'

export function AccessDenied() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">This area is private</h1>
        <p className="mt-3 leading-relaxed text-neutral-600 dark:text-neutral-400">
          You&apos;re signed in, but this Google account doesn&apos;t have access to the admin area. Sign out and try
          again with the account that does.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/admin/login' })
          }}
        >
          <button
            type="submit"
            className="bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Sign out
          </button>
        </form>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          Back to the blog
        </Link>
      </div>
    </div>
  )
}
