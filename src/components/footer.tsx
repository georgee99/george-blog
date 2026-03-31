import { siteConfig } from "@/lib/config";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 flex items-center justify-between border-t border-neutral-200 pt-8 dark:border-neutral-800">
      <p className="text-sm text-neutral-500">
        © {year} {siteConfig.name}
      </p>
      <div className="flex gap-4 text-sm text-neutral-500">
        <a
          href={siteConfig.social.github}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          GitHub
        </a>
        <a
          href={siteConfig.social.twitter}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          X
        </a>
      </div>
    </footer>
  );
}
