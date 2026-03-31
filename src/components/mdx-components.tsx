import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Override default HTML elements rendered by MDX.
 * Add more overrides here as needed (e.g. custom <img>, <h2>, etc.)
 */
export const mdxComponents: MDXComponents = {
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
