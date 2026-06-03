import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import BionicToggle from "./bionic-toggle";
import { siteConfig } from "@/lib/config";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/guestbook", label: "Guestbook" },
  { href: "/ask", label: "Ask" },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-200 bg-white/80 py-4 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4">
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
        <div className="flex items-center gap-2">
          <BionicToggle />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
