"use client";

import React, { createContext, useContext, useSyncExternalStore, useEffect, ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "../supabase/client";
import { getUserPreferences, updateUserPreferences } from "../services/preferences-service";

export type Theme = "light" | "dark";

const STORAGE_KEY = "testo_theme";
const themeListeners = new Set<() => void>();

function persistTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

function applyDocumentTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    const themeChanged = document.documentElement.classList.contains("dark") !== (theme === "dark");
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (themeChanged) themeListeners.forEach((listener) => listener());
  }
}

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function readDocumentTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
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
  // Hydrate from the same server snapshot, then sync with the blocking script's
  // document class on the client without producing a hydration mismatch.
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readDocumentTheme,
    () => initialTheme ?? "light",
  );

  useEffect(() => {
    if (initialTheme) applyDocumentTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    let active = true;

    const applyProfileTheme = async (userId: string) => {
      try {
        const preferences = await getUserPreferences(userId);
        if (!active || !preferences) return;
        const savedTheme = preferences.preferred_theme;
        applyDocumentTheme(savedTheme);
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
      // A dark theme restored from localStorage has already been applied and
      // persisted by the blocking bootstrap script.
      if (readDocumentTheme() === "dark") return;

      // New visitors and accounts start in light mode regardless of OS theme.
      persistTheme("light");
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

  const setTheme = async (newTheme: Theme) => {
    applyDocumentTheme(newTheme);
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
