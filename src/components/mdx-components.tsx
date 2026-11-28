import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { createElement, type ComponentPropsWithoutRef } from "react";
import SpidermanToggle from "@/components/spiderman-toggle";
import BionicToggle from "@/components/bionic-toggle";
import CopyCode from "@/components/copy-code";

function heading(tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function Heading({ id, children, ...props }: ComponentPropsWithoutRef<"h2">) {
    return createElement(tag, { id, ...props }, children, id && (
      <a
        href={`#${encodeURIComponent(id)}`}
        aria-label={`Link to section ${id}`}
        className="ml-2 no-underline opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
      >#</a>
    ));
  };
}

/**
 * Override default HTML elements rendered by MDX.
 * Add more overrides here as needed (e.g. custom <img>, <h2>, etc.)
 */
export const mdxComponents: MDXComponents = {
  SpidermanToggle,
  BionicToggle,
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  h5: heading("h5"),
  h6: heading("h6"),
  pre: CopyCode,
  // Internal links use Next.js Link; external links open in a new tab
  a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
    if (!href) return <a {...props}>{children}</a>;
    if (href.startsWith("/") || href.startsWith("#")) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
};
