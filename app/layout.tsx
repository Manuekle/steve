import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n/provider";
import { SoundProvider } from "@/components/sound-provider";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";
import "./globals.css";

// Geist Mono loaded from Google Fonts (used in code blocks).
const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

// Inter and Saans are loaded via @font-face in globals.css
// from /public/fonts so we can use the self-hosted woff2/ttf files.
// The CSS variables --font-sans and --font-heading are declared there.

export const metadata: Metadata = {
  // Every route under this layout resolves its relative metadata URLs against
  // this — the auto-attached `opengraph-image`, and the `icon.svg` /
  // `apple-icon` links Next emits from the file convention. The marketing
  // pages set their own through `marketingMetadata`; without it here the app
  // routes emitted relative OG paths, which crawlers do not follow.
  metadataBase: new URL(SITE_URL),
  title: "steve — AI agent manager",
  description: "A self-hosted AI agent manager for the Meta ecosystem — WhatsApp, Instagram, Messenger, and Meta Ads.",
};

// Inline script runs before paint to set the theme class from
// localStorage or system preference, preventing FOUC.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('steve-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    // `es`, because that is what the app actually serves: `DEFAULT_LOCALE` is
    // Spanish, so every server-rendered page — the landing included — ships
    // Spanish copy. `lang="en"` here was telling screen readers and
    // translation tools the wrong thing about the whole app, not just the
    // landing. The client swaps this when the visitor picks English.
    <html className={cn(mono.variable)} lang="es" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <I18nProvider>
            <SoundProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </SoundProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
