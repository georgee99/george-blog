import { getAllPosts } from "@/lib/posts";

export function GET() {
  return Response.json(
    getAllPosts().map(({ slug, title, description, tags }) => ({
      href: `/blog/${slug}`,
      title,
      description,
      tags,
      kind: "Article",
    }))
  );
}
