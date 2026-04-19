"use client";

import React from "react";
import Link from "next/link";
import type { PostMeta } from "@/lib/posts";
import SearchBar from "@/components/search-bar";
import { formatDate } from "@/lib/utils";

type Props = {
  posts: PostMeta[];
};

const POSTS_PER_PAGE = 10;

export default function BlogList({ posts }: Props) {
  const [query, setQuery] = React.useState("");
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);

  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    posts.forEach((p) => p.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [posts]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      const matchesQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q);
      const matchesTag = !selectedTag || p.tags?.includes(selectedTag);
      return matchesQuery && matchesTag;
    });
  }, [posts, query, selectedTag]);

  const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);

  const paginated = React.useMemo(() => {
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    return filtered.slice(start, start + POSTS_PER_PAGE);
  }, [filtered, currentPage]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [query, selectedTag]);

  return (
    <div>
      <SearchBar onSearch={setQuery} />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8 w-3/4 mx-auto">
          <button
            onClick={() => setSelectedTag(null)}
            aria-pressed={selectedTag === null}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              selectedTag === null
                ? "bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100"
                : "border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
            }`}
          >
            all
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              aria-pressed={tag === selectedTag}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                tag === selectedTag
                  ? "bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100"
                  : "border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-neutral-400">No posts found</p>
      ) : (
        <>
          <ul className="space-y-4">
            {paginated.map((post) => (
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="px-3 py-1 rounded border text-sm transition-colors border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
              >
                ←
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  aria-current={page === currentPage ? "page" : undefined}
                  className={`px-3 py-1 rounded border text-sm transition-colors ${
                    page === currentPage
                      ? "bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100"
                      : "border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="px-3 py-1 rounded border text-sm transition-colors border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
