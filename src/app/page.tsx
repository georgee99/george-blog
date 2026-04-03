import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAllPosts } from "@/lib/posts";
import { formatDate } from "@/lib/utils";
import { siteConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          {siteConfig.name}
        </h1>
        <p className="mt-3 leading-relaxed text-neutral-600 dark:text-neutral-400">
          {siteConfig.tagline}
        </p>
      </section>

      {/* Recent writing — only shown when posts exist */}
      {recentPosts.length > 0 && (
        <section>
          <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            Recent writing
          </h2>
          <ul className="space-y-4">
            {recentPosts.map((post) => (
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
          <Link
            href="/blog"
            className="mt-6 inline-block text-sm text-neutral-400 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            All posts →
          </Link>
          <Image
            src="/meow/S3.png"
            alt="meow"
            width={168}
            height={16}
            className="mt-2 mx-auto"
            aria-hidden="true"
          />
        </section>
      )}
    </div>
  );
}

