export type CommandItem = {
  href: string;
  title: string;
  description: string;
  tags?: string[];
  kind: "Page" | "Article";
};

export const navigationCommands: CommandItem[] = [
  { href: "/", title: "Home", description: "Go to the home page", kind: "Page" },
  { href: "/blog", title: "Blog", description: "Browse all articles", kind: "Page" },
  { href: "/guestbook", title: "Guestbook", description: "Visit the guestbook", kind: "Page" },
  { href: "/ask", title: "Ask", description: "Ask the AI assistant", kind: "Page" },
];

export function searchCommands(items: CommandItem[], query: string): CommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const terms = q.split(/\s+/);
  return items
    .map((item, index) => {
      const title = item.title.toLowerCase();
      const metadata = [item.description, item.href, ...(item.tags ?? [])]
        .join(" ")
        .toLowerCase();
      if (!terms.every((term) => title.includes(term) || metadata.includes(term))) {
        return { item, index, score: -1 };
      }
      const score = title === q ? 4 : title.startsWith(q) ? 3 : terms.every((term) => title.includes(term)) ? 2 : 1;
      return { item, index, score };
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}
