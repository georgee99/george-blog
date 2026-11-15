import { redirect } from 'next/navigation'
import { auth, signOut } from '@/auth'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const admin = await getAdminSession()
  if (!admin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          This account is not authorised to view the admin area.
        </p>
        <LogoutButton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        Signed in as {admin.user?.email}. RAG analytics will appear here.
      </p>
      <LogoutButton />
    </div>
  )
}

function LogoutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/admin/login' })
      }}
    >
      <button
        type="submit"
        className="border border-neutral-300 px-4 py-2 text-sm transition-opacity hover:opacity-80 dark:border-neutral-700"
      >
        Sign out
      </button>
    </form>
  )
}
