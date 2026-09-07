"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "../supabase/client";

export type Theme = "light" | "dark";

const STORAGE_KEY = "testo_theme";

/** Read the last-known theme synchronously from localStorage (Fix 3).
 *  Falls back to undefined when localStorage is unavailable (SSR, first visit). */
function readCachedTheme(): Theme | undefined {
  if (typeof localStorage === "undefined") return undefined;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : undefined;
}

interface ThemeContextProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: Theme;
}) {
  // Fix 3: synchronous initializer — avoids flash on repeat visits.
  // Priority: explicit prop > localStorage cache > 'light' default.
  const [theme, setThemeState] = useState<Theme>(
    initialTheme ?? readCachedTheme() ?? "light"
  );

  useEffect(() => {
    // Skip async init when an explicit prop was provided (test / SSR scenario).
    if (initialTheme) return;

    const initTheme = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("preferred_theme")
          .eq("id", user.id)
          .single();
        if (data?.preferred_theme) {
          const t = data.preferred_theme as Theme;
          setThemeState(t);
          localStorage.setItem(STORAGE_KEY, t);
          return;
        }
      }

      // Logged-out: fall back to prefers-color-scheme.
      const prefersDark =
        typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false;
      const resolved: Theme = prefersDark ? "dark" : "light";
      setThemeState(resolved);
      localStorage.setItem(STORAGE_KEY, resolved);
    };
    initTheme();
  }, [initialTheme]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ preferred_theme: newTheme }).eq("id", user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
