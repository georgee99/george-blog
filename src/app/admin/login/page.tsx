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
      <h1 className="text-2xl font-semibold tracking-tight">Admin sign in</h1>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error === 'AccessDenied'
            ? 'Access denied. This Google account is not authorised.'
            : 'Sign in failed. Please try again.'}
        </p>
      )}
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
    </div>
  )
}
