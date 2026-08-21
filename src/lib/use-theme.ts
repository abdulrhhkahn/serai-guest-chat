import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "serai-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Client-only by design — only used inside the staff (_authenticated) and
 * platform-admin layouts, both already ssr:false, so there's no SSR/hydration
 * mismatch to worry about. Guest-facing pages never render this and never
 * read/write the stored preference, so they're unaffected either way.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return { theme, toggle };
}
