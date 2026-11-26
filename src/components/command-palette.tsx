"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { navigationCommands, searchCommands, type CommandItem } from "@/lib/command-search";

const subscribe = () => () => {};
const getShortcut = () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "⌘ K" : "Ctrl K";
const getServerShortcut = () => "Ctrl K";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [articles, setArticles] = useState<CommandItem[] | null>(null);
  const [error, setError] = useState(false);
  const shortcut = useSyncExternalStore(subscribe, getShortcut, getServerShortcut);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function show() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented || event.isComposing || event.repeat ||
        event.altKey || event.shiftKey || event.metaKey === event.ctrlKey ||
        event.key.toLowerCase() !== "k" ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")))
      ) return;
      event.preventDefault();
      if (!open) show();
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    input.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previousFocus.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || articles !== null) return;
    const controller = new AbortController();
    fetch("/api/command-search", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load articles");
        return response.json() as Promise<CommandItem[]>;
      })
      .then((items) => {
        setArticles(items);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [open, articles]);

  const results = useMemo(
    () => searchCommands([...navigationCommands, ...(articles ?? [])], query),
    [articles, query]
  );
  const selected = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (open && results.length) {
      document.getElementById(`command-option-${selected}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, selected, results]);

  function choose(item: CommandItem) {
    setOpen(false);
    router.push(item.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`Search pages and articles (${shortcut})`}
        aria-haspopup="dialog"
        className="flex min-h-10 items-center gap-1 rounded border border-neutral-300 px-2 text-sm text-neutral-600 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <span>Search</span>
        <kbd className="hidden text-xs text-neutral-400 sm:inline">{shortcut}</kbd>
      </button>
      {open && (
        <dialog
          ref={dialog}
          aria-labelledby="command-title"
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          className="fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] m-auto flex max-h-[min(32rem,calc(100dvh-2rem))] w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/50 sm:top-[15vh] dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        >
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 dark:border-neutral-800">
            <label id="command-title" htmlFor="command-query" className="sr-only">Search pages and articles</label>
            <input
              ref={input}
              id="command-query"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={results.length ? `command-option-${selected}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder="Search pages and articles..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  if (results.length) {
                    setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
                  }
                } else if (event.key === "Enter" && results[selected]) {
                  event.preventDefault();
                  choose(results[selected]);
                }
              }}
              className="min-w-0 flex-1 bg-transparent py-4 text-base outline-none placeholder:text-neutral-400"
            />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="min-h-10 min-w-10 rounded text-sm text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 dark:hover:text-neutral-100">Esc</button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
            <div id="command-results" role="listbox" aria-label="Search results">
              {results.map((item, index) => (
                <div
                  key={item.href}
                  id={`command-option-${index}`}
                  role="option"
                  aria-selected={index === selected}
                  onMouseMove={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                  className={`cursor-pointer rounded px-3 py-3 ${index === selected ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{item.kind}</span>
                  </div>
                  {item.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">{item.description}</p>}
                </div>
              ))}
            </div>
            {!results.length && <p className="px-3 py-5 text-sm text-neutral-500">No matching pages or articles.</p>}
            {articles === null && <p className="px-3 py-2 text-sm text-neutral-500">{error ? "Articles could not be loaded. Close and reopen search to retry." : "Loading articles…"}</p>}
          </div>
          <p role="status" className="sr-only">{results.length} results{articles === null ? ", articles not loaded" : ""}</p>
        </dialog>
      )}
    </>
  );
}
