"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "../supabase/client";
import { getUserPreferences, updateUserPreferences } from "../services/preferences-service";

export type Theme = "light" | "dark";

const STORAGE_KEY = "testo_theme";

function persistTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/** Read the last-known theme synchronously from localStorage (Fix 3).
 *  Falls back to undefined when localStorage is unavailable (SSR, first visit). */
function readCachedTheme(): Theme | undefined {
  if (typeof localStorage === "undefined") return undefined;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : undefined;
}

interface ThemeContextProps {
  theme: Theme;
  setTheme: (theme: Theme) => Promise<void>;
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
    let active = true;
    const applyProfileTheme = async (userId: string) => {
      try {
        const preferences = await getUserPreferences(userId);
        if (!active || !preferences) return;
        const savedTheme = preferences.preferred_theme;
        setThemeState(savedTheme);
        persistTheme(savedTheme);
      } catch {
        // Keep the server or browser preference if the profile is temporarily unavailable.
      }
    };
    const initTheme = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await applyProfileTheme(user.id);
        return;
      }

      if (initialTheme) return;
      // If there's already a cached theme, we don't need to apply the unauthenticated system fallback
      if (readCachedTheme()) return;

      // Logged-out: fall back to prefers-color-scheme.
      const prefersDark =
        typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false;
      const resolved: Theme = prefersDark ? "dark" : "light";
      setThemeState(resolved);
      persistTheme(resolved);
    };
    void initTheme();

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.user) {
        const userId = session.user.id;
        window.setTimeout(() => void applyProfileTheme(userId), 0);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
    persistTheme(newTheme);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await updateUserPreferences(user.id, { preferred_theme: newTheme }, supabase);
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
