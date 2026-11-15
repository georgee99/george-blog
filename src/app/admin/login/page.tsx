import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signIn } from '@/auth'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await getAdminSession()) redirect('/admin')

  const { error } = await searchParams

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">This area is private</h1>
        <p className="mt-3 leading-relaxed text-neutral-600 dark:text-neutral-400">
          The admin area is only for the site owner. If that&apos;s you, sign in with your Google account to
          continue; otherwise, you can head back to the blog.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error === 'AccessDenied'
            ? "That Google account doesn't have access. Try a different account."
            : "Sign in didn't work. Please try again."}
        </p>
      )}
      <div className="flex items-center gap-4">
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/admin' })
          }}
        >
          <button
            type="submit"
            className="bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Sign in with Google
          </button>
        </form>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          Back to the blog
        </Link>
      </div>
    </div>
  )
}
