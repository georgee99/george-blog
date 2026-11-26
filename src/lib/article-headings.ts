import type { Root, RootContent, PhrasingContent } from "mdast";

export interface ArticleHeading {
  id: string;
  text: string;
  depth: 2 | 3;
}

function headingText(nodes: PhrasingContent[]): string {
  return nodes.map((node) => {
    if ("value" in node && typeof node.value === "string") return node.value;
    if ("alt" in node && typeof node.alt === "string") return node.alt;
    if ("children" in node) return headingText(node.children as PhrasingContent[]);
    return "";
  }).join("");
}

export function articleHeadings(headings: ArticleHeading[]) {
  return () => (tree: Root) => {
    const used = new Set<string>();

    function visit(nodes: RootContent[]) {
      for (const node of nodes) {
        if (node.type === "heading") {
          const text = headingText(node.children);
          const base = text.toLowerCase().trim()
            .replace(/[^\p{L}\p{N}\s_-]/gu, "")
            .replace(/\s+/g, "-") || "section";
          let id = base;
          let suffix = 1;
          while (used.has(id)) id = `${base}-${suffix++}`;
          used.add(id);
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
          if (node.depth === 2 || node.depth === 3) {
            headings.push({ id, text, depth: node.depth });
          }
        }
        if ("children" in node && node.type !== "heading") {
          visit(node.children as RootContent[]);
        }
      }
    }

    visit(tree.children);
  };
}
