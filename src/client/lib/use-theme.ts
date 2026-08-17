import { useCallback, useEffect, useState } from "react";

import { THEME_STORAGE_KEY } from "@/client/lib/theme-script";

export type ThemeMode = "light" | "dark";

function readStored(): ThemeMode | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const s = readStored();
    if (s) return s;
    return systemPrefersDark() ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const toggle = useCallback(() => {
    setMode(m => (m === "dark" ? "light" : "dark"));
  }, []);

  return { mode, toggle, setMode };
}
