import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getPost, getPostSlugs } from "@/lib/posts";
import { mdxComponents } from "@/components/mdx-components";
import { formatDate } from "@/lib/utils";
import CommentForm from "@/components/comment-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.meta.title,
    description: post.meta.description,
    openGraph: {
      title: post.meta.title,
      description: post.meta.description,
      type: "article",
      publishedTime: post.meta.date,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post || !post.meta.published) {
    notFound();
  }

  return (
    <article>
      <header className="mb-10 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {post.meta.title}
        </h1>
        <time
          className="block text-sm text-neutral-400"
          dateTime={post.meta.date}
        >
          {formatDate(post.meta.date)}
        </time>
      </header>

      <div className="prose prose-neutral max-w-none dark:prose-invert">
        <MDXRemote
          source={post.source}
          components={mdxComponents}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
            },
          }}
        />
      </div>

      <CommentForm postSlug={slug} />
    </article>
  );
}
