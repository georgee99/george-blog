"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { BACKGROUND_STORAGE_KEY } from "@/lib/background-color";

const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_DARK_BACKGROUND = "#111111";

export function BackgroundColorPicker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const savedColor = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (inputRef.current) {
      inputRef.current.value =
        savedColor ?? (resolvedTheme === "dark" ? DEFAULT_DARK_BACKGROUND : DEFAULT_BACKGROUND);
    }
    if (savedColor) {
      document.documentElement.style.setProperty("--custom-background", savedColor);
    }
  }, [resolvedTheme]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextColor = event.currentTarget.value;
    document.documentElement.style.setProperty("--custom-background", nextColor);
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, nextColor);
  }

  return (
    <label
      className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-neutral-100 focus-within:ring-2 focus-within:ring-neutral-500 dark:hover:bg-neutral-800"
      title="Choose background color"
    >
      <span
        className="h-4 w-4 rounded-full border border-neutral-300 dark:border-neutral-600"
        style={{ backgroundColor: "var(--background)" }}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="color"
        defaultValue={DEFAULT_BACKGROUND}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Choose page background color"
      />
    </label>
  );
}
