import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getAllPosts, getPost, getPostSlugs, getRelatedPosts } from "@/lib/posts";
import { articleHeadings, type ArticleHeading } from "@/lib/article-headings";
import { siteConfig } from "@/lib/config";
import { mdxComponents } from "@/components/mdx-components";
import { formatDate } from "@/lib/utils";
import CommentsSection from "@/components/comments-section";
import SubscribeForm from "@/components/subscribe-form";
import ArticleReading from "@/components/article-reading";

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
  const image = post.meta.image ?? siteConfig.defaultImage;
  const url = `/blog/${slug}`;

  return {
    title: post.meta.title,
    description: post.meta.description,
    authors: [{ name: siteConfig.author }],
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: post.meta.title,
      description: post.meta.description,
      url,
      siteName: siteConfig.name,
      locale: "en_AU",
      type: "article",
      publishedTime: post.meta.date,
      authors: [siteConfig.author],
      tags: post.meta.tags,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: post.meta.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.meta.title,
      description: post.meta.description,
      images: [image],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post || !post.meta.published) {
    notFound();
  }

  const headings: ArticleHeading[] = [];
  const { content } = await compileMDX({
    source: post.source,
    components: mdxComponents,
    options: { mdxOptions: { remarkPlugins: [remarkGfm, articleHeadings(headings)] } },
  });
  const relatedPosts = getRelatedPosts(post.meta, getAllPosts());

  const articleUrl = new URL(`/blog/${slug}`, siteConfig.url).toString();
  const imageUrl = new URL(
    post.meta.image ?? siteConfig.defaultImage,
    siteConfig.url,
  ).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.meta.title,
    description: post.meta.description,
    datePublished: post.meta.date,
    author: {
      "@type": "Person",
      name: siteConfig.author,
      url: siteConfig.url,
    },
    publisher: {
      "@type": "Person",
      name: siteConfig.author,
      url: siteConfig.url,
    },
    image: imageUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
    articleSection: post.meta.tags,
    keywords: post.meta.tags,
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
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

      <ArticleReading headings={headings}>{content}</ArticleReading>

      {relatedPosts.length > 0 && (
        <section aria-label="Related articles" className="mt-12 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <h2 className="mb-4 text-lg font-semibold">Related articles</h2>
          <ul className="space-y-4">
            {relatedPosts.map((related) => (
              <li key={related.slug}>
                <Link href={`/blog/${related.slug}`} className="group flex items-baseline justify-between gap-4 rounded focus-visible:outline-2 focus-visible:outline-offset-2">
                  <span className="text-neutral-900 underline-offset-4 decoration-neutral-300 group-hover:underline dark:text-neutral-100 dark:decoration-neutral-600">{related.title}</span>
                  <time className="shrink-0 text-sm text-neutral-400" dateTime={related.date}>{formatDate(related.date)}</time>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CommentsSection postSlug={slug} />
      <SubscribeForm source="blogpage"/>
    </article>
  );
}
