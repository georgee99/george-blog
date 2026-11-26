"use client";

import { useRef, useState, useEffect, type ComponentPropsWithoutRef } from "react";

export default function CopyCode({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(""), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    const code = preRef.current?.querySelector("code");
    try {
      if (!code || !navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code.textContent ?? "");
      setStatus("Copied!");
    } catch {
      setStatus("Copy failed");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2 top-2 rounded border border-neutral-500 bg-neutral-800 px-2 py-1 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        {status || "Copy"}
      </button>
      <span className="sr-only" role="status">{status}</span>
      <pre ref={preRef} {...props}>{children}</pre>
    </div>
  );
}
