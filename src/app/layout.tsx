import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { I18nProvider, Language } from "@/lib/i18n/provider";
import { ThemeProvider, type Theme } from "@/lib/theme/provider";
import { QueryProvider } from "@/lib/query/provider";
import { PreferenceSwitcher } from "@/components/shared/PreferenceSwitcher";
import "./globals.css";
import "./workspace.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Testo",
  description: "AI-powered exam platform",
};

function getLanguageFromAcceptLanguage(
  acceptLanguage: string | null,
): Language | undefined {
  if (!acceptLanguage) return undefined;

  return acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().toLowerCase().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number(qualityParameter.trim().slice(2))
        : 1;

      return {
        language: tag.split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ language }) => (language === "en" || language === "ar" ? language : undefined))
    .find((language): language is Language => language !== undefined);
}

// Root layout — Server Component.
// suppressHydrationWarning is required because ThemeProvider mutates the <html>
// classList on the client (to apply "dark"), causing a benign hydration mismatch.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
  const langCookie = cookieStore.get("testo_language")?.value;
  const themeCookie = cookieStore.get("testo_theme")?.value;
  const cookieLanguage = langCookie === "en" || langCookie === "ar" ? langCookie : undefined;
  const initialTheme: Theme | undefined =
    themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;
  const initialLang =
    cookieLanguage ??
    getLanguageFromAcceptLanguage(headersList.get("accept-language")) ??
    "ar";
  const initialDir = initialLang === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={initialLang}
      dir={initialDir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${initialTheme === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[--color-background] text-[--color-foreground]">
        <QueryProvider>
          <ThemeProvider initialTheme={initialTheme}>
            <I18nProvider initialLanguage={initialLang}>
              <PreferenceSwitcher />
              {children}
            </I18nProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
