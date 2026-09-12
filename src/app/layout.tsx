import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/provider";
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
// dir and lang on <html> are set reactively by the I18nProvider client component.
// suppressHydrationWarning is required because ThemeProvider mutates the <html>
// classList on the client (to apply "dark"), causing a benign hydration mismatch.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[--color-background] text-[--color-foreground]">
        <QueryProvider>
          <ThemeProvider>
            <I18nProvider>
              {children}
            </I18nProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
