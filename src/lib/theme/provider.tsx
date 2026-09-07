"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "../supabase/client";

export type Theme = "light" | "dark";

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
  const [theme, setThemeState] = useState<Theme>(initialTheme || "light");

  useEffect(() => {
    if (initialTheme) return;

    const initTheme = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("profiles").select("preferred_theme").eq("id", user.id).single();
        if (data?.preferred_theme) {
          setThemeState(data.preferred_theme as Theme);
          return;
        }
      }
      
      const prefersDark =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : false
      setThemeState(prefersDark ? 'dark' : 'light')
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
