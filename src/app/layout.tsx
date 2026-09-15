import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider, Language } from "@/lib/i18n/provider";
import { ThemeProvider } from "@/lib/theme/provider";
import { QueryProvider } from "@/lib/query/provider";
import "./globals.css";

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

// Root layout — Server Component.
// suppressHydrationWarning is required because ThemeProvider mutates the <html>
// classList on the client (to apply "dark"), causing a benign hydration mismatch.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("testo_language")?.value;
  const initialLang = (langCookie === "en" || langCookie === "ar") ? (langCookie as Language) : "ar";
  const initialDir = initialLang === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={initialLang}
      dir={initialDir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[--color-background] text-[--color-foreground]">
        <QueryProvider>
          <ThemeProvider>
            <I18nProvider initialLanguage={initialLang}>
              {children}
            </I18nProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
