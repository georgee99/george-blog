import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/auth'
import { AccessDenied } from '@/components/admin-access'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const sections = [
  {
    href: '/admin/rag',
    title: 'RAG analytics',
    description: 'View search activity, performance and costs.',
  },
  {
    href: '/admin/moderation',
    title: 'Comment moderation',
    description: 'Manage blog comments and guestbook entries.',
  },
]

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string; cursor?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (!await getAdminSession()) return <AccessDenied />

  const params = await searchParams
  const legacyFilters = new URLSearchParams()
  for (const key of ['from', 'to', 'status', 'cursor'] as const) {
    if (typeof params[key] === 'string' && params[key]) legacyFilters.set(key, params[key])
  }
  if (legacyFilters.size) redirect(`/admin/rag?${legacyFilters}`)

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            Choose a section to manage your blog.
          </p>
        </div>
        <form action={async () => {
          'use server'
          await signOut({ redirectTo: '/admin/login' })
        }}>
          <button
            type="submit"
            className="border border-neutral-300 px-4 py-2 text-sm transition-opacity hover:opacity-80 dark:border-neutral-700"
          >
            Sign out
          </button>
        </form>
      </div>

      <nav aria-label="Admin sections" className="grid grid-cols-2 gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex aspect-square flex-col justify-between border border-neutral-200 p-3 transition-colors hover:border-neutral-500 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:border-neutral-800 dark:hover:border-neutral-500 dark:hover:bg-neutral-900 sm:p-6"
          >
            <div>
              <h2 className="text-sm font-semibold sm:text-lg">{section.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400 sm:text-sm">
                {section.description}
              </p>
            </div>
            <span aria-hidden="true" className="hidden text-neutral-400 sm:block">→</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
