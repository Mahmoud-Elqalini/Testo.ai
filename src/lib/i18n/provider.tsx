"use client";

import React, { createContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "../supabase/client";
import en from "../../locales/en.json";
import ar from "../../locales/ar.json";

const dictionaries: Record<string, Record<string, unknown>> = { en, ar };
export type Language = "en" | "ar";

const STORAGE_KEY = "testo_language";

/** Read the last-known language synchronously from localStorage (Fix 3).
 *  Falls back to undefined when localStorage is unavailable (SSR, first visit). */
function readCachedLanguage(): Language | undefined {
  if (typeof localStorage === "undefined") return undefined;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "en" || v === "ar" ? v : undefined;
}

interface I18nContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

export const I18nContext = createContext<I18nContextProps | undefined>(undefined);

export function I18nProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  // Fix 3: synchronous initializer — avoids flash on repeat visits.
  // Priority: explicit prop > localStorage cache > hardcoded default.
  const [language, setLanguageState] = useState<Language>(
    initialLanguage ?? readCachedLanguage() ?? "ar"
  );

  useEffect(() => {
    // Skip async init when an explicit prop was provided (test / SSR scenario).
    if (initialLanguage) return;

    const initLang = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("preferred_language")
          .eq("id", user.id)
          .single();
        if (data?.preferred_language) {
          const lang = data.preferred_language as Language;
          setLanguageState(lang);
          localStorage.setItem(STORAGE_KEY, lang);
          return;
        }
      }

      // Logged-out: fall back to browser locale (Fix 2 correctness — jsdom = 'en-US').
      const browserLang: Language = navigator.language.startsWith("en") ? "en" : "ar";
      setLanguageState(browserLang);
      localStorage.setItem(STORAGE_KEY, browserLang);
    };
    initLang();
  }, [initialLanguage]);

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ preferred_language: lang }).eq("id", user.id);
    }
  };

  const t = (key: string) => {
    const keys = key.split(".");
    let value: unknown = dictionaries[language];
    for (const k of keys) {
      if (!value || typeof value !== "object") break;
      value = (value as Record<string, unknown>)[k];
    }
    return typeof value === "string" ? value : key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}
