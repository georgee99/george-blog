"use client";

import React from "react";
import Link from "next/link";
import type { PostMeta } from "@/lib/posts";
import SearchBar from "@/components/search-bar";
import { formatDate } from "@/lib/utils";

type Props = {
  posts: PostMeta[];
};

export default function BlogList({ posts }: Props) {
  const [query, setQuery] = React.useState("");

  const handleSearch = (q: string) => {
    setQuery(q);
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => {
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
      );
    });
  }, [posts, query]);

  return (
    <div>
      <SearchBar onSearch={handleSearch} />

      {filtered.length === 0 ? (
        <p className="text-neutral-400">No posts found</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex items-baseline justify-between gap-4"
              >
                <span className="text-neutral-900 underline-offset-4 decoration-neutral-300 group-hover:underline dark:text-neutral-100 dark:decoration-neutral-600">
                  {post.title}
                </span>
                <time className="shrink-0 text-sm text-neutral-400" dateTime={post.date}>
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
