"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SteveMark } from "@/components/icons/steve-mark";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/use-session";
import { useActiveSection, useStuckHeader } from "@/lib/hooks/use-reveal";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Shell } from "./primitives";

/**
 * Every section on the landing that carries an `id`, in document order. The
 * nav and the scroll-spy read the same list, so a section can no longer end
 * up anchorable but unreachable from the header — which is what had happened
 * to Meta Ads.
 */
const LINKS = [
  { id: "bandeja", labelKey: "nav.inbox" },
  { id: "automatizaciones", labelKey: "nav.automations" },
  { id: "agentes", labelKey: "landing.header.linkAgents" },
  { id: "capacidades", labelKey: "landing.header.linkCapabilities" },
  { id: "ads", labelKey: "nav.ads" },
  { id: "autoalojado", labelKey: "landing.header.linkSelfHosted" },
  { id: "preguntas", labelKey: "landing.header.linkFaq" },
] as const;

/** Hoisted so the observer's dependency array is stable across renders. */
const SECTION_IDS = LINKS.map((link) => link.id);

/** Marketing pages of their own, reached from anywhere. */
const PAGES = [
  { href: "/pricing", labelKey: "landing.header.linkPricing" },
  { href: "/guide", labelKey: "landing.header.linkGuide" },
] as const;

/**
 * The wordmark, in the same two-tone treatment the sidebar uses: `st` dropped
 * back to a quarter-opacity grey, `eve` at full contrast. It is the app's
 * signature, so the landing does not get its own version of it.
 */
export function Wordmark({ className }: { readonly className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <SteveMark />
      <span className="font-semibold text-lg leading-none tracking-tight">
        <span className="text-muted-foreground/40">st</span>
        <span className="text-foreground">eve</span>
      </span>
    </span>
  );
}

/**
 * The header.
 *
 * Three zones on one row: wordmark left, nav centred, actions right. The nav
 * is absolutely positioned rather than a flex child, because centring it with
 * `justify-between` puts it wherever the two side groups happen to leave room
 * — and those groups are different widths, so the nav sits visibly off-centre
 * and moves as the copy changes.
 *
 * The active section gets a hairline under it. It is the only structural mark
 * in the bar, and it is telling the reader where they are, which is the one
 * thing a single-page nav can say that a list of links cannot.
 */
export function LandingHeader() {
  const t = useT();
  const headerRef = useRef<HTMLElement>(null);
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = useActiveSection(SECTION_IDS);
  const pathname = usePathname();

  /**
   * Section links are bare fragments on the landing and full paths anywhere
   * else. Pricing and the legal pages share this header, and a bare `#agentes`
   * there points at nothing.
   */
  const onLanding = pathname === "/";
  const sectionHref = (id: string) => (onLanding ? `#${id}` : `/#${id}`);

  useStuckHeader(headerRef);

  /**
   * Plays the exit animation before unmounting. The panel used to carry
   * `t-dropdown`, a Radix-only class whose exit rule hangs off
   * `[data-state="closed"]` — an attribute nothing here ever set — so the menu
   * appeared with an animation and then vanished on a frame.
   */
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="lp-header" ref={headerRef}>
      {/* The frost, as its own layer. The blur is a Tailwind utility rather
          than a `backdrop-filter` in globals.css because only the utilities
          resolve through the `--tw-backdrop-*` chain and come out of this
          project's CSS pipeline intact — the same reason `.lp-veil` carries
          its blurs on spans. `.lp-header-blur` fades it in on scroll. */}
      <div aria-hidden="true" className="lp-header-blur backdrop-blur-xl backdrop-saturate-150" />
      <Shell className="relative flex h-16 items-center justify-between gap-6">
        <Link
          href="/"
          aria-label={t("landing.header.homeAria")}
          className="lp-focus shrink-0 rounded-md transition-opacity duration-150 hover:opacity-80"
        >
          <Wordmark />
        </Link>

        <nav
          aria-label={t("landing.header.sectionsAria")}
          className="-translate-x-1/2 absolute left-1/2 hidden items-center gap-5 text-[13px] lg:flex"
        >
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={sectionHref(link.id)}
              aria-current={active === link.id ? "true" : undefined}
              className="lp-navlink lp-focus"
            >
              {t(link.labelKey)}
            </a>
          ))}
          {PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              aria-current={pathname === page.href ? "page" : undefined}
              className="lp-navlink lp-focus"
            >
              {t(page.labelKey)}
            </Link>
          ))}
        </nav>

        {/* The two calls to action both used to point at gated routes —
            `/dashboard` and `/setup` — so a visitor who had never signed in
            was invited to open an app that would bounce them straight to the
            login. What is offered now depends on who is asking: an owner gets
            the app, everyone else gets the door.

            Nothing renders while the answer is in flight. A button that says
            "Open the app" for 200ms and then becomes "Sign in" is worse than
            one that arrives once. */}
        <div className="flex items-center gap-2">
          {session.loading ? (
            <span aria-hidden="true" className="h-8 w-[7.5rem] rounded-xl bg-muted/60" />
          ) : session.signedIn ? (
            <Button asChild size="sm">
              <Link href="/dashboard">{t("landing.cta.openApp")}</Link>
            </Button>
          ) : (
            /* No radius override: `size="sm"` already carries the system's
               11px, and a pill here would be the one button on the site that
               is not shaped like every button inside the product. */
            <Button asChild size="sm">
              <Link href="/login">
                {session.claimed ? t("landing.cta.signIn") : t("landing.cta.start")}
              </Link>
            </Button>
          )}
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="lp-menu"
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.menu")}
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            className="lp-focus -mr-2 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground lg:hidden"
          >
            <HugeiconsIcon icon={menuOpen ? Cancel01Icon : Menu01Icon} size={18} strokeWidth={1.75} />
          </button>
        </div>
      </Shell>

      {/* Mounted always, `data-open` toggling — that is what `.t-panel-slide`
          expects, and it is why the close half can animate at all. It used to
          be conditionally rendered with a 140ms timer holding the unmount
          open long enough for an exit keyframe to play, which is a race with
          the animation dressed up as state.

          `inert` while closed does the work that unmounting used to: no tab
          stop, no screen reader, no click. The stylesheet only sets
          `pointer-events: none`, which would have left every link in there
          reachable by keyboard on a page that shows no menu. */}
      <div
        className="t-panel-slide border-border border-b bg-background/95 backdrop-blur-xl lg:hidden"
        data-open={menuOpen}
        id="lp-menu"
        inert={!menuOpen}
        style={{ "--panel-translate-y": "-14px" } as React.CSSProperties}
      >
          <Shell className="flex flex-col gap-1 py-3">
            {LINKS.map((link) => (
              <a
                key={link.id}
                href={sectionHref(link.id)}
                aria-current={active === link.id ? "true" : undefined}
                onClick={closeMenu}
                className="lp-focus rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current]:text-foreground"
              >
                {t(link.labelKey)}
              </a>
            ))}
            {[
              ...PAGES,
              session.signedIn
                ? { href: "/dashboard", labelKey: "landing.cta.openApp" }
                : { href: "/login", labelKey: session.claimed ? "landing.cta.signIn" : "landing.cta.start" },
            ].map((page) => (
              <Link
                key={page.href}
                href={page.href}
                onClick={closeMenu}
                className="lp-focus rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current]:text-foreground"
                aria-current={pathname === page.href ? "page" : undefined}
              >
                {t(page.labelKey)}
              </Link>
            ))}
        </Shell>
      </div>
    </header>
  );
}
