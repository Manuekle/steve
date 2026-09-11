"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Cancel01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SenkaMark } from "@/components/icons/senka-mark";
import { useSmoothScroll } from "@/components/motion/smooth-scroll";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/use-session";
import { useActiveSection, useStuckHeader } from "@/lib/hooks/use-reveal";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Shell } from "./primitives";

/**
 * Every section on the landing that carries an `id`, in document order. The
 * nav, the scroll-spy and the footer read the same list, so a section can no
 * longer end up anchorable but unreachable — which is what had happened to
 * Meta Ads — and the footer cannot drift out of step with the bar at the top
 * of the same page.
 */
export const LINKS = [
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
export const PAGES = [
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
      {/* Milled, not flat. The mark sits on the page ground here — header and
          footer — so the `--lp-lumen-*` ramp reads: bright at the cap line,
          falling to the baseline, under the same overhead light every other
          object on the marketing surface is under. The word beside it stays
          plain: a milled logotype is a chrome effect, a milled mark next to
          plain type is a lockup. */}
      <SenkaMark metal />
      <span className="font-semibold text-lg leading-none tracking-tight">
        <span className="text-foreground">senka</span>
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
  const menuInnerRef = useRef<HTMLDivElement>(null);
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

  /**
   * The page holds still while the sheet is open.
   *
   * It did not, and that was the worst of the mobile bugs: the menu is pinned
   * to a fixed header, so a stray touch scrolled the whole document underneath
   * it and the sheet looked like it had come unstuck from the page. With Lenis
   * driving the scroll it was worse — the momentum carried on after the menu
   * closed, so you landed somewhere you never asked for.
   *
   * It takes both halves, and neither one is sufficient:
   *
   * `overflow: hidden` on the root — set through a `data-menu-open` attribute
   * so the rule lives in the stylesheet — is what stops the native path, which
   * is what a reader on `prefers-reduced-motion` gets, since `SmoothScroll`
   * hands them plain scrolling and there is no Lenis instance at all.
   *
   * `lenis.stop()` is what stops the other one. Lenis does not scroll the
   * document by scrolling it: it listens for wheel and touch, and writes the
   * offset itself. `overflow: hidden` is invisible to that — the menu locked
   * the page in every browser except the one the page actually ships with,
   * which is the sort of fix that looks done and is not.
   */
  const { lenis } = useSmoothScroll();

  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    root.dataset.menuOpen = "";
    lenis?.stop();
    return () => {
      delete root.dataset.menuOpen;
      lenis?.start();
    };
  }, [menuOpen, lenis]);

  /**
   * Closed by anything that makes it stale: a route change, and the viewport
   * crossing into the width where the sheet is `lg:hidden`.
   *
   * The second one is not theoretical. `data-open` stayed `true` through a
   * rotation or a resize, so the panel was still open — inert-free, tabbable,
   * `pointer-events: auto` — sitting invisibly under the desktop header, and
   * it came back the instant the window narrowed again with the burger showing
   * a close icon for a menu the reader never opened.
   */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  /**
   * Publishes the drawer's natural height to the header as `--lp-menu-h`.
   *
   * The drawer opens by transitioning `height`, and `height: auto` does not
   * transition — so something has to know the number. It is measured rather
   * than guessed because the row count is not fixed: the last item depends on
   * whether the reader is signed in, and every label is translated, so a
   * two-line row in one locale is a row height the stylesheet cannot know.
   *
   * Written straight to the DOM instead of through state. A measurement that
   * re-renders the header is a re-render on every rotation and on the frame
   * the session resolves, for a value only CSS ever reads.
   *
   * Zero is never published. Above the breakpoint the drawer is `lg:hidden`,
   * and a `display: none` element measures 0 — publish that and the menu opens
   * to nothing the next time the window is narrow enough to have one.
   */
  const measureMenu = useCallback(() => {
    const header = headerRef.current;
    const inner = menuInnerRef.current;
    if (!header || !inner) return;

    const height = inner.offsetHeight;
    if (height > 0) header.style.setProperty("--lp-menu-h", `${height}px`);
  }, []);

  /**
   * Kept current while the page is open — a locale switch or the session
   * resolving changes the height of a menu nobody has opened yet.
   *
   * The observer is not sufficient on its own, which is why the button
   * measures too: an element that has been `display: none` since mount has
   * never been observed at a real size, and coming back from none does not
   * reliably deliver an entry. Crossing the breakpoint with the menu shut is
   * exactly that case, and it is the common one — every desktop reader who
   * narrows the window, and every phone that rotates.
   */
  useEffect(() => {
    const inner = menuInnerRef.current;
    if (!inner) return;

    measureMenu();
    const observer = new ResizeObserver(measureMenu);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [measureMenu]);

  /** Measured on the way in, so the first open animates to the right height. */
  const openMenu = () => {
    measureMenu();
    setMenuOpen(true);
  };

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (wide.matches) setMenuOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="lp-header" data-menu-open={menuOpen} ref={headerRef}>
      {/* The frost, as its own layer, and — since the drawer below is part of
          this element's box — the mobile menu's background too. One surface,
          so the bar and the open menu cannot disagree about what colour they
          are, which is what they used to do at the top of the page.

          The blur is a Tailwind utility rather than a `backdrop-filter` in
          globals.css because only the utilities resolve through the
          `--tw-backdrop-*` chain and come out of this project's CSS pipeline
          intact — the same reason `.lp-veil` carries its blurs on spans.
          `.lp-header-blur` fades it in on scroll, and holds it up while the
          menu is open however far down the page the reader is. */}
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
              <Link href="/dashboard" prefetch={false}>{t("landing.cta.openApp")}</Link>
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
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
            className="lp-focus -mr-2 relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground lg:hidden"
          >
            {/* Both glyphs, stacked and cross-faded, rather than one swapped
                on state. Swapping is a hard cut on the frame the click lands,
                against a drawer that takes half a second to come out — the
                button was already showing the close icon while the menu was
                still on its way in. They turn as they trade, which is the same 45° the
                landing's accordions use to make a plus into a cross. */}
            {(
              [
                [Menu01Icon, !menuOpen],
                [Cancel01Icon, menuOpen],
              ] as const
            ).map(([icon, shown], index) => (
              <span
                aria-hidden="true"
                // biome-ignore lint/suspicious/noArrayIndexKey: two fixed glyphs
                key={index}
                className="absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-[var(--panel-open-dur)] ease-[var(--panel-ease)]"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? "rotate(0deg)" : "rotate(-45deg)",
                }}
              >
                <HugeiconsIcon icon={icon} size={18} strokeWidth={1.75} />
              </span>
            ))}
          </button>
        </div>
      </Shell>

      {/* Mounted always, `data-open` toggling — that is what the drawer needs
          to animate both halves, and it is also what lets the content be
          measured while the menu is shut (see `--lp-menu-h` above).

          `inert` while closed does the work unmounting used to: no tab stop,
          no screen reader, no click. The stylesheet only clips it, which would
          have left every link in there reachable by keyboard on a page that
          shows no menu.

          No background, no border, no shadow of its own. It is a window onto
          content that already sits under the bar, and the frost layer above
          is what the reader sees it through — a second opaque panel here is
          exactly the seam this replaced. */}
      <div className="lp-menu lg:hidden" data-open={menuOpen} id="lp-menu" inert={!menuOpen}>
        {/* The measured element, and the drawer's scroll region on a screen
            too short to hold the whole list. `data-lenis-prevent` keeps the
            smooth-scroll driver off it. */}
        <div className="lp-menu-inner" data-lenis-prevent ref={menuInnerRef}>
          <Shell className="flex flex-col gap-1 py-3">
            {LINKS.map((link, index) => (
              <a
                key={link.id}
                href={sectionHref(link.id)}
                aria-current={active === link.id ? "true" : undefined}
                onClick={closeMenu}
                className="lp-menu-item lp-focus rounded-lg px-3 py-2.5 text-muted-foreground text-sm transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current]:text-foreground"
                style={{ "--i": index } as React.CSSProperties}
              >
                {t(link.labelKey)}
              </a>
            ))}
            {[
              ...PAGES,
              session.signedIn
                ? { href: "/dashboard", labelKey: "landing.cta.openApp" }
                : { href: "/login", labelKey: session.claimed ? "landing.cta.signIn" : "landing.cta.start" },
            ].map((page, index) => (
              <Link
                key={page.href}
                href={page.href}
                onClick={closeMenu}
                className="lp-menu-item lp-focus rounded-lg px-3 py-2.5 text-muted-foreground text-sm transition-colors duration-150 hover:bg-accent hover:text-foreground aria-[current]:text-foreground"
                aria-current={pathname === page.href ? "page" : undefined}
                /* The stagger runs across both lists, so it carries on from
                   where the section links left off rather than restarting. */
                style={{ "--i": LINKS.length + index } as React.CSSProperties}
              >
                {t(page.labelKey)}
              </Link>
            ))}
          </Shell>
        </div>
      </div>
    </header>
  );
}
