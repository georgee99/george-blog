import Link from "next/link";
import { getAllPosts } from "@/lib/posts";
import { formatDate } from "@/lib/utils";

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
        <p className="mt-3 leading-relaxed text-neutral-600 dark:text-neutral-400">
          Writing on my random interests
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-neutral-400">No posts yet. Check back soon.</p>
      ) : (
        <ul className="space-y-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex items-baseline justify-between gap-4"
              >
                <span className="text-neutral-900 underline-offset-4 decoration-neutral-300 group-hover:underline dark:text-neutral-100 dark:decoration-neutral-600">
                  {post.title}
                </span>
                <time
                  className="shrink-0 text-sm text-neutral-400"
                  dateTime={post.date}
                >
                  {formatDate(post.date)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
