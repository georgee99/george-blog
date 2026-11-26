import fs from "fs";
import path from "path";
import matter from "gray-matter";

const POSTS_DIR = path.join(process.cwd(), "content/posts");

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  description: string;
  published: boolean;
  tags: string[];
  image?: string;
}

export interface Post {
  meta: PostMeta;
  source: string;
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

export function getAllPosts(): PostMeta[] {
  return getPostSlugs()
    .map((slug) => readPostMeta(slug))
    .filter((post) => post.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getRelatedPosts(current: PostMeta, posts: PostMeta[]): PostMeta[] {
  const tags = new Set(current.tags.map((tag) => tag.toLowerCase()));
  const seen = new Set<string>();
  return posts
    .filter((post) => {
      if (!post.published || post.slug === current.slug || seen.has(post.slug)) return false;
      seen.add(post.slug);
      return true;
    })
    .map((post) => ({
      post,
      score: new Set(post.tags.map((tag) => tag.toLowerCase()).filter((tag) => tags.has(tag))).size,
    }))
    .sort((a, b) => b.score - a.score || b.post.date.localeCompare(a.post.date) || a.post.slug.localeCompare(b.post.slug))
    .slice(0, 3)
    .map(({ post }) => post);
}

function readPostMeta(slug: string): PostMeta {
  const filePath = path.join(POSTS_DIR, `${slug}.mdx`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const normalized = raw.replace(/^\s+/, "");
  const { data } = matter(normalized);
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ? new Date(data.date).toISOString() : "",
    description: data.description ?? "",
    published: data.published !== false,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    image: typeof data.image === "string" ? data.image : undefined,
  };
}

export async function getPost(slug: string): Promise<Post | null> {
  const filePath = path.join(POSTS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  const normalized = raw.replace(/^\s+/, "");
  const { data, content } = matter(normalized);
  const meta: PostMeta = {
    slug,
    title: data.title ?? slug,
    date: data.date ? new Date(data.date).toISOString() : "",
    description: data.description ?? "",
    published: data.published !== false,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    image: typeof data.image === "string" ? data.image : undefined,
  };
  return { meta, source: content };
}
