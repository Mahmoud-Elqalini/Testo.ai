"use client";

import React, { createContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "../supabase/client";
import en from "../../locales/en.json";
import ar from "../../locales/ar.json";

const dictionaries: Record<string, any> = { en, ar };
export type Language = "en" | "ar";

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
  const [language, setLanguageState] = useState<Language>(initialLanguage || "ar");
  const [isInitialized, setIsInitialized] = useState(!!initialLanguage);

  useEffect(() => {
    if (initialLanguage) return;

    const initLang = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("profiles").select("preferred_language").eq("id", user.id).single();
        if (data?.preferred_language) {
          setLanguageState(data.preferred_language as Language);
          setIsInitialized(true);
          return;
        }
      }
      
      const browserLang = navigator.language.startsWith("en") ? "en" : "ar";
      setLanguageState(browserLang);
      setIsInitialized(true);
    };
    initLang();
  }, [initialLanguage]);

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ preferred_language: lang }).eq("id", user.id);
    }
  };

  const t = (key: string) => {
    const keys = key.split(".");
    let value: any = dictionaries[language];
    for (const k of keys) {
      if (value === undefined) break;
      value = value[k];
    }
    return typeof value === "string" ? value : key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}
