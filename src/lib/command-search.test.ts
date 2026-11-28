import assert from "node:assert/strict";
import test from "node:test";
import { navigationCommands, searchCommands, type CommandItem } from "./command-search";
import { GET } from "../app/api/command-search/route";
import { getAllPosts } from "./posts";

const items: CommandItem[] = [
  { href: "/metadata", title: "Other", description: "Search", tags: ["typescript"], kind: "Article" },
  { href: "/partial", title: "A search guide", description: "", kind: "Article" },
  { href: "/prefix", title: "Search guide", description: "", kind: "Article" },
  { href: "/exact", title: "Search", description: "", kind: "Article" },
];

test("ranks title matches above metadata and ignores case", () => {
  assert.deepEqual(searchCommands(items, " SEARCH ").map((item) => item.href), [
    "/exact", "/prefix", "/partial", "/metadata",
  ]);
});

test("matches partial terms across metadata and keeps stable ordering", () => {
  assert.deepEqual(searchCommands(items, "type SEAR").map((item) => item.href), ["/metadata"]);
  assert.deepEqual(searchCommands(items, "guide").map((item) => item.href), ["/partial", "/prefix"]);
  assert.deepEqual(searchCommands(items, "missing"), []);
  assert.deepEqual(searchCommands(items, ""), items);
});

test("index contains exactly published posts and only metadata", async () => {
  const index = await GET().json() as CommandItem[];
  const posts = getAllPosts();
  assert.deepEqual(index.map((item) => item.href), posts.map((post) => `/blog/${post.slug}`));
  assert.equal(new Set(index.map((item) => item.href)).size, index.length);
  assert.ok(index.every((item) => item.kind === "Article" && !("source" in item)));
  assert.deepEqual(navigationCommands.map((item) => item.href), ["/", "/blog", "/guestbook", "/ask"]);
});
