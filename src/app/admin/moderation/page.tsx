import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccessDenied } from '@/components/admin-access'
import ModerationList from '@/components/moderation-list'
import { getAdminSession } from '@/lib/admin-auth'
import { getAllPosts } from '@/lib/posts'

export const dynamic = 'force-dynamic'

export default async function ModerationPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (!await getAdminSession()) return <AccessDenied />

  const titles = Object.fromEntries(getAllPosts().map((post) => [post.slug, post.title]))
  return (
    <div className="space-y-8">
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        &larr; Admin home
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comment moderation</h1>
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          Manage blog comments and guestbook entries.
        </p>
      </div>
      <ModerationList titles={titles} />
    </div>
  )
}
