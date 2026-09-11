import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/lib/i18n/provider";
import { SoundProvider } from "@/components/sound-provider";
import { ToastProvider } from "@/components/toast-provider";
import { PrivacyConsent } from "@/components/privacy-consent";
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
  // `apple-icon` links Next emits from the file convention.
  metadataBase: new URL(SITE_URL),
  title: "senka — agentes de IA para atención al cliente",
  description:
    "Gestiona agentes de IA, conversaciones y automatizaciones para WhatsApp, Instagram y Meta Ads. Planes alojados y licencia Enterprise autoalojada.",
  robots: process.env.VERCEL_ENV === "preview" ? { index: false, follow: false } : undefined,
};

/**
 * Sets the theme class before the browser paints anything.
 *
 * This has to be a raw inline <script>, not `next/script`. In the App Router
 * a `beforeInteractive` script is not inlined into the HTML — it is pushed
 * onto `self.__next_s` and replayed by the Next runtime once the framework
 * bundle has loaded. That is long after first paint, so every full page load
 * in dark mode rendered the light palette first and then snapped to dark: the
 * white flash. A plain inline script runs during head parsing, before any
 * paint, which is the whole point of it.
 *
 * This was tried again with `next/script` and the served HTML is the proof:
 * the head ships `(self.__next_s=self.__next_s||[]).push([0,{"children":"..."}])`
 * — the source as data, not as a script that runs. The raw tag ships
 * `<script>(function(){...})()</script>` in the same position and executes there.
 *
 * `color-scheme` goes on too, so the parts the page does not paint itself —
 * the canvas behind it, scrollbars, form controls — start out dark as well.
 */
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('senka-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
    var root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html
      className={cn(mono.variable)}
      lang="es"
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>

      <body suppressHydrationWarning>
        <ThemeProvider>
          <I18nProvider>
            <SoundProvider>
              <TooltipProvider>
                <ToastProvider>{children}<PrivacyConsent /></ToastProvider>
              </TooltipProvider>
            </SoundProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
