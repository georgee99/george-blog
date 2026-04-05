import { getAllPosts } from "@/lib/posts";
import BlogList from "@/components/blog-list";

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
      <BlogList posts={posts} />
    </div>
  );
}
