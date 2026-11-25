import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { I18nProvider } from "@/lib/i18n/provider";
import { ThemeProvider, type Theme } from "@/lib/theme/provider";
import { themeBootstrapScript } from "@/lib/theme/bootstrap-script";
import { QueryProvider } from "@/lib/query/provider";
import { SiteNavigation } from "@/components/shared/SiteNavigation";
import "./globals.css";
import "./workspace.css";
import "./auth.css";
import "./public-home.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Manjam",
  description: "AI-powered exam platform",
  icons: {
    icon: [
      {
        url: "/images/logo/manjam-favicon-light.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/images/logo/manjam-favicon-dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

// Root layout — Server Component.
// The bootstrap script can set the browser-only theme before hydration, so only
// the expected <html> class difference is suppressed.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("testo_language")?.value;
  const themeCookie = cookieStore.get("testo_theme")?.value;
  const cookieLanguage = langCookie === "en" || langCookie === "ar" ? langCookie : undefined;
  const initialTheme: Theme | undefined =
    themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;
  const initialLang = cookieLanguage ?? "en";
  const initialDir = initialLang === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={initialLang}
      dir={initialDir}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${initialTheme === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>
        <script id="theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-[--color-background] text-[--color-foreground]">
        <QueryProvider>
          <ThemeProvider initialTheme={initialTheme}>
            <I18nProvider initialLanguage={initialLang}>
              <SiteNavigation>{children}</SiteNavigation>
            </I18nProvider>
          </ThemeProvider>
        </QueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
