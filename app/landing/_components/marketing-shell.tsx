"use client";

import { useRef, type ReactNode } from "react";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { useReveal } from "@/lib/hooks/use-reveal";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";

/**
 * The frame every marketing page sits in: the dark wrapper, the header, the
 * footer, and the single IntersectionObserver that drives the reveals.
 *
 * It lives beside the landing's own components rather than in a folder of its
 * own because every marketing surface — the landing, pricing, the two legal
 * pages — is built from this same set. If the landing ever moves to `/` behind
 * a route group, the whole folder moves with it.
 *
 * `lp` no longer carries `dark`. It used to, which made the marketing surface
 * dark whatever the visitor had chosen inside the product — and made a theme
 * toggle on these pages a control that could not do its one job. The four
 * landing-only values that assumed a dark ground (the two hairline washes, the
 * bloom and the frame bevel) now have both halves in `globals.css`, so the
 * surface follows `<html>` like every other page.
 *
 * The marketing copy used to be pinned to Spanish with `I18nLocale`, on the
 * theory that it was hardcoded prose that couldn't follow the visitor's
 * locale. It no longer is: every string here runs through the dictionary, so
 * the pin is gone and this subtree reads `I18nContext` straight from
 * `I18nProvider`, the same one every other page uses.
 */
export function MarketingShell({ children }: { readonly children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useReveal(rootRef);

  return (
    <>
      {/* Lenis drives the page here and nowhere else. The product's own pages
          are worked in — a list you are scanning should answer the wheel
          exactly, and eased scrolling on a working inbox is latency you did
          not ask for. A marketing page is read, and the eased wheel is what
          makes a long one feel like one surface instead of a stack.

          `SmoothScroll` drops to native scrolling under `prefers-reduced-
          motion` on its own, which is the guide's designed fallback rather
          than a disabled feature. */}
      <SmoothScroll>
        <div className="lp min-h-dvh" ref={rootRef}>
          <LandingHeader />
          <main>{children}</main>
          <LandingFooter />
        </div>
      </SmoothScroll>
    </>
  );
}

/**
 * The opening block of a marketing page that is not the landing: an eyebrow,
 * a heading and a standfirst on the prose rail, over the same hairline the
 * feature sections use. Deliberately quieter than the landing's hero — these
 * are pages you arrive at knowing what you came for.
 */
export function PageHeader({
  eyebrow,
  lede,
  title,
  titleClassName = "",
}: {
  readonly eyebrow: string;
  readonly lede: ReactNode;
  readonly title: string;
  readonly titleClassName?: string;
}) {
  return (
    <header className="border-border border-b pt-32 pb-16 sm:pt-40 sm:pb-20">
      <div className="mx-auto w-full max-w-[1120px] px-6 sm:px-8">
        <p className="lp-eyebrow">{eyebrow}</p>
        <h1 className={`mt-4 max-w-[20ch] text-balance font-heading font-semibold text-[clamp(2.25rem,5vw,3.5rem)] text-foreground leading-[1.02] tracking-[-0.03em] ${titleClassName}`}>
          {title}
        </h1>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">{lede}</p>
      </div>
    </header>
  );
}
