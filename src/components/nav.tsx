import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { siteConfig } from "@/lib/config";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
];

export function Nav() {
  return (
    <nav className="flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          {siteConfig.name}
        </Link>
        <div className="flex gap-4">
          {navLinks.slice(1).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <ThemeToggle />
    </nav>
  );
}
