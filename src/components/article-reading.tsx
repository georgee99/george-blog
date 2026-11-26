"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ArticleHeading } from "@/lib/article-headings";

export default function ArticleReading({ headings, children }: { headings: ArticleHeading[]; children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("");

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const elements = headings.map(({ id }) => document.getElementById(id)).filter((element): element is HTMLElement => !!element);
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = body.getBoundingClientRect();
      const progress = rect.height > 0
        ? Math.max(0, Math.min(1, (window.innerHeight - rect.top) / rect.height))
        : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
      let current = "";
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= 100) current = element.id;
        else break;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [headings]);

  const toc = (
    <nav aria-label="Table of contents">
      <ul className="space-y-2 text-sm">
        {headings.map((item) => (
          <li key={item.id} className={item.depth === 3 ? "ml-4" : ""}>
            <a
              href={`#${encodeURIComponent(item.id)}`}
              aria-current={active === item.id ? "location" : undefined}
              className={`block rounded focus-visible:outline-2 focus-visible:outline-offset-2 ${active === item.id ? "font-semibold text-neutral-900 dark:text-neutral-100" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"}`}
            >{item.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <>
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-[60] h-0.5">
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-neutral-600 dark:bg-neutral-300" />
      </div>
      {headings.length > 0 && (
        <details className="mb-8 rounded border border-neutral-200 p-4 dark:border-neutral-800 xl:hidden">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2">On this page</summary>
          <div className="mt-4">{toc}</div>
        </details>
      )}
      <div className="relative">
        {headings.length > 0 && (
          <aside className="absolute bottom-0 left-[calc(100%+2rem)] top-0 hidden w-48 xl:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <p className="mb-3 text-sm font-semibold">On this page</p>
              {toc}
            </div>
          </aside>
        )}
        <div ref={bodyRef} className="prose prose-neutral max-w-none dark:prose-invert article-body">
          {children}
        </div>
      </div>
    </>
  );
}
