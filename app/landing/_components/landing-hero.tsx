"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextReveal } from "@/components/motion/text-reveal";
import { useSession } from "@/lib/auth/use-session";
import { useT } from "@/lib/i18n/provider";
import { ChatScreen } from "./app-screens";
import { Reveal, ScreenFrame, Shell } from "./primitives";

/**
 * The first screen: one claim, one screenshot, two ways in.
 *
 * The composition is Linear's, because it is the right one for a product whose
 * argument is visual — headline pinned to the left rail rather than centred,
 * the product immediately underneath and bleeding off the fold, so the page
 * has already shown you what it is before you decide whether to scroll.
 */
export function LandingHero() {
  const t = useT();
  const session = useSession();

  return (
    <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24">
      {/* Backdrop: hairline grid, then a wide neutral bloom sitting behind the
          headline. Both are pointer-transparent and neither reflows. */}
      <div aria-hidden="true" className="lp-grid" />
      <div
        aria-hidden="true"
        className="lp-glow"
        style={{ top: "-14rem", width: "min(1100px, 130vw)", height: "44rem" }}
      />

      <Shell className="relative">
        <Reveal>
          {/* The announcement row. The container takes the app's card shape —
              a 12px squircle, `--card` surface, hairline border — and the
              only pill on it is the app's own `Badge`, which is round by
              design. A full-pill container here was the shape the product
              never uses. */}
          <Link
            href="/agents"
            className="group inline-flex items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pr-3 pl-1.5 text-xs shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] duration-200 hover:border-input hover:shadow-[var(--shadow-elevated)]"
          >
            <Badge className="px-2 py-0.5 text-[10px]">{t("landing.hero.badge")}</Badge>
            <span className="text-muted-foreground">{t("landing.hero.announcement")}</span>
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              size={13}
              strokeWidth={2}
              className="text-muted-foreground/70 transition-transform duration-200 ease-[var(--lp-ease)] group-hover:translate-x-0.5"
            />
          </Link>
        </Reveal>

        {/* On mount, not on view: this line is above the fold on every device,
            so an in-view trigger fires at the same instant anyway and only
            costs an observer. `delay` keeps it a beat behind the badge. */}
        <TextReveal
          as="h1"
          blur={6}
          className="mt-8 max-w-[24ch] text-balance font-heading font-semibold font-cooper text-[clamp(2.75rem,6.6vw,4.25rem)] text-foreground leading-[1.02] tracking-[-0.03em]"
          delay={0.12}
          stagger={0.04}
          text={t("landing.hero.title")}
          yOffset="24%"
        />

        <Reveal delay={120}>
          <p className="mt-7 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">
            {t("landing.hero.subtitle")}
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            {/* Signed in, the pair is "open the app" and nothing else to
                explain; signed out, the primary is the door and the secondary
                is the pricing — the only other page a visitor can reach. */}
            <Button asChild size="lg">
              <Link href={session.signedIn ? "/dashboard" : "/login"}>
                {session.signedIn
                  ? t("landing.cta.openApp")
                  : session.claimed
                    ? t("landing.cta.signIn")
                    : t("landing.cta.start")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={session.signedIn ? "/settings" : "/pricing"}>
                {session.signedIn ? t("landing.cta.settings") : t("landing.cta.pricing")}
              </Link>
            </Button>
            <span className="ml-1 text-[13px] text-muted-foreground">{t("landing.hero.noAccount")}</span>
          </div>
        </Reveal>
      </Shell>

      {/* The product. It sits on a wider rail than the copy and runs past the
          bottom of the fold on purpose — a screen you can see all of is a
          screen you have finished looking at. The veil at its foot does the
          rest: the page ends by going out of focus rather than by stopping. */}
      <div className="relative mx-auto mt-16 w-full max-w-[1240px] px-6 sm:mt-20 sm:px-8">
        <Reveal delay={240} lift={false}>
          <ScreenFrame
            label="Chat"
            hint={t("landing.hero.frameHint")}
            overlays={null}
            url="localhost:3000"
          >
            <ChatScreen empty />
          </ScreenFrame>
        </Reveal>
      </div>
    </section>
  );
}
