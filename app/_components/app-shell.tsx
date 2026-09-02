"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Menu01Icon,
  Cancel01Icon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useSound } from "@/components/sound-provider";
import { SoundToggle } from "@/components/sound-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { SteveMark } from "@/components/icons/steve-mark";
import { NotificationBadge } from "@/components/ai-elements/notification-badge";
import { SidebarNotifications } from "@/components/ai-elements/sidebar-notifications";
import { SidebarStatus } from "@/components/ai-elements/sidebar-status";
import { SupportDialog } from "@/components/ai-elements/support-dialog";
import { CommandPalette } from "@/components/ai-elements/command-palette";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getChats } from "@/lib/dashboard-store";
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from "@/lib/nav-items";
import { useT } from "@/lib/i18n/provider";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "steve:sidebar-collapsed";

export function AppShell({ children }: { readonly children: ReactNode }) {
  const t = useT();
  // The shell lives in the `(app)` layout, so it mounts once and survives
  // navigation: the active route has to come from the router, not a prop.
  const activePath = usePathname();
  const { cue } = useSound();
  const [chatBadge, setChatBadge] = useState(0);
  const [inboxBadge, setInboxBadge] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // La preferencia vive en localStorage, que el servidor no tiene: se lee
  // después de montar para que el HTML del SSR coincida con el cliente.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Best-effort.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Best-effort.
      }
      return next;
    });
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activePath]);

  // `arrival` marks landing on a new route, but only for client-side ones.
  //
  // The first pass is the page you already loaded, and a browser blocks audio
  // on a fresh visit anyway — cueing it would either play nothing or play a
  // sound nobody asked for on arriving at the app.
  //
  // It remembers the path rather than a "have I run before" flag: an effect
  // re-run that is not a navigation — StrictMode's double invoke in dev, a
  // changed `cue` identity — would satisfy a boolean and ring on a route
  // nobody moved to.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current !== null && lastPath.current !== activePath) cue("arrival");
    lastPath.current = activePath;
  }, [activePath, cue]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  /** Ids already counted in the inbox badge, so a refresh can tell an arrival
   *  from a re-read. `null` until the first response lands: that one seeds the
   *  set and stays silent, because the queue you had when you opened the app
   *  is not news. */
  const knownWaitingIds = useRef<Set<string> | null>(null);

  const refreshBadges = useCallback(() => {
    try {
      const chats = getChats();
      const active = chats.filter(
        (c) => Date.now() - new Date(c.lastMessageAt).getTime() < 60 * 60 * 1000,
      ).length;
      setChatBadge(active);
    } catch {
      // Dashboard store may not be available
    }
    void fetch("/api/contacts")
      // An error body is still JSON: without the `ok` check its missing
      // `contacts` key would clear the badge and claim nothing is waiting.
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { contacts?: Array<{ id: string; status: string }> }) => {
        const waiting = (data.contacts ?? []).filter(
          (c) => c.status === "waiting_human" || c.status === "followup_due",
        );
        // Ids, not the count: one handoff resolved while another arrives
        // leaves the number identical, and a notification you only get when
        // the total happens to move is worse than none.
        //
        // The badge is the only thing in the shell that knows someone started
        // waiting, and the shell is the only thing mounted on every route —
        // so this is where the bell belongs, not on the inbox page you would
        // have to already be looking at.
        const seen = knownWaitingIds.current;
        if (seen && waiting.some((c) => !seen.has(c.id))) cue("chime");
        knownWaitingIds.current = new Set(waiting.map((c) => c.id));
        setInboxBadge(waiting.length);
      })
      .catch(() => {
        // Inbox badge is optional
      });
  }, [cue]);

  // Was a mount-only effect, which meant the badge could only ever be as fresh
  // as the last full page load — and a badge that never moves cannot announce
  // anything. Same 30s cadence the inbox, chats and dashboard pages already use.
  usePolling(refreshBadges, 30_000);

  /** Nested routes light up their section: /crm/leads marks /crm, and
   *  /agents/x/voice marks /agents. */
  const isActivePath = (href: string): boolean =>
    activePath === href || activePath.startsWith(`${href}/`);

  /** Badges live here, not in the shared nav list, because they're runtime
   *  state — the palette has no use for them. */
  const badgeFor = (href: string): number =>
    href === "/history" ? chatBadge : href === "/inbox" ? inboxBadge : 0;

  /** One nav row. Expanded it carries its own label, so the tooltip only
   *  appears when the sidebar is icons-only. */
  const renderNavItem = (item: NavItem) => {
    const isActive = isActivePath(item.href);
    const badgeCount = badgeFor(item.href);
    // A crisp tick on nav hover, a knock on press — the two places the
    // cuelume guide says sound actually earns its keep.
    const cueAttrs = { "data-cuelume-hover": "tick", "data-cuelume-press": "" } as const;
    const linkClassName = cn(
      "relative flex items-center rounded-lg py-2 text-sm font-medium transition-all duration-150",
      collapsed ? "justify-center px-0" : "gap-3 px-3",
      isActive
        ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
    );
    const linkContent = (
      <>
        <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} className="shrink-0" />
        {collapsed ? null : t(item.labelKey)}
        {badgeCount ? <NotificationBadge count={badgeCount} /> : null}
      </>
    );

    if (!collapsed) {
      return (
        <Link key={item.href} href={item.href} className={linkClassName} {...cueAttrs}>
          {linkContent}
        </Link>
      );
    }
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>
          {/* Icon-only here, so the accessible name has to come from
              aria-label — there's no visible text for it to read. */}
          <Link href={item.href} aria-label={t(item.labelKey)} className={linkClassName} {...cueAttrs}>
            {linkContent}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* First thing the keyboard reaches, visible only once focused. Without
          it, reaching page content meant tabbing through the whole sidebar —
          around twenty links — on every single navigation. WCAG 2.4.1. */}
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only",
          "focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg",
          "focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium",
          "focus:text-primary-foreground focus:shadow-[var(--shadow-button)]",
        )}
      >
        {t("nav.skipToContent")}
      </a>

      {/* Sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-card/50 backdrop-blur-sm md:flex",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-[60px]" : "w-60",
        )}
      >
        <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center px-2" : "gap-2.5 px-5")}>
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <SteveMark />
              <span className="text-lg font-semibold">
                <span className="text-muted-foreground/40">st</span>
                <span className="text-foreground">eve</span>
              </span>
            </div>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-muted-foreground",
                  "transition-colors duration-150 hover:bg-accent hover:text-foreground",
                  collapsed ? null : "ml-auto -mr-1",
                )}
              >
                <HugeiconsIcon icon={collapsed ? PanelLeftIcon : PanelLeftCloseIcon} size={16} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? t("nav.expand") : t("nav.collapse")}</TooltipContent>
          </Tooltip>
        </div>

        {/* The two things you reach for before navigating anywhere: starting a
            conversation, and jumping straight to a page by name. */}
        <div className={cn("flex shrink-0 flex-col gap-1.5 pb-2", collapsed ? "items-center px-2" : "px-3")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/chat"
                aria-label={t("nav.newChat")}
                data-cuelume-press
                className={cn(
                  "flex items-center rounded-lg bg-primary text-sm font-medium text-primary-foreground",
                  "shadow-[var(--shadow-button)] transition-transform duration-150 active:scale-[0.98]",
                  collapsed ? "size-8 justify-center" : "gap-2 px-3 py-2",
                )}
              >
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} className="shrink-0" />
                {collapsed ? null : t("nav.newChat")}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t("nav.newChat")}</TooltipContent>
          </Tooltip>
          <CommandPalette collapsed={collapsed} />
        </div>

        <nav className={cn("flex flex-1 flex-col gap-1 overflow-y-auto py-2 scrollbar-hide", collapsed ? "px-2" : "px-3")}>
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.id} className={cn("flex flex-col gap-1", groupIndex > 0 && "mt-3")}>
              {/* Collapsed to icons there is no room for a heading, so the
                  groups are separated by a rule instead. */}
              {group.labelKey && !collapsed ? (
                <p className="px-3 pb-1 text-[11px] font-medium text-muted-foreground/60">
                  {t(group.labelKey)}
                </p>
              ) : null}
              {group.labelKey && collapsed ? (
                <span aria-hidden="true" className="mx-auto my-1 h-px w-5 bg-border" />
              ) : null}
              {group.items.map((item) => renderNavItem(item))}
            </div>
          ))}
        </nav>

        <div className={cn("border-t border-border", collapsed ? "flex flex-col items-center gap-1 p-2" : "p-3")}>
          {/* Things that need doing, and where to go when something breaks —
              both above the preferences, which are set once and forgotten. */}
          <SidebarNotifications collapsed={collapsed} className={collapsed ? undefined : "w-full"} />
          <SupportDialog collapsed={collapsed} className={collapsed ? undefined : "w-full"} />

          {/* Preferences: icon-only in a single row when expanded. Three
              full-width rows for switches nobody touches twice made the foot
              of the sidebar heavier than the navigation above it. */}
          <div
            className={cn(
              "flex",
              collapsed ? "flex-col items-center gap-1" : "mt-1 items-center gap-0.5 border-t border-border pt-2",
            )}
          >
            <ThemeToggle className="size-8 justify-center p-0" showLabel={false} />
            <SoundToggle className="size-8 justify-center p-0" showLabel={false} />
            <LanguageToggle className="size-8 justify-center p-0" showLabel={false} />
            <SignOutButton className="size-8 justify-center p-0" showLabel={false} />
          </div>

          <SidebarStatus collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile top bar + dropdown nav */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="relative md:hidden">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <span className="text-lg font-semibold">
              <span className="text-muted-foreground/40">st</span>
              <span className="text-foreground">eve</span>
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="relative inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.menu")}
              aria-expanded={mobileMenuOpen}
            >
              <span className="t-icon-swap" data-state={mobileMenuOpen ? "b" : "a"}>
                <span className="t-icon" data-icon="a">
                  <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.75} />
                </span>
                <span className="t-icon" data-icon="b">
                  <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.75} />
                </span>
              </span>
              {!mobileMenuOpen && chatBadge + inboxBadge > 0 ? (
                <NotificationBadge count={chatBadge + inboxBadge} />
              ) : null}
            </button>
          </div>

          {mobileMenuOpen ? (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
              aria-label={t("nav.closeMenu")}
              tabIndex={-1}
            />
          ) : null}

          <nav
            className="t-panel-slide absolute inset-x-0 top-14 z-20 flex flex-col gap-1 border-b border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm"
            style={{ "--panel-translate-y": "-10px" } as CSSProperties}
            data-open={mobileMenuOpen}
          >
            {NAV_ITEMS.map((item) => {
              const isActive = isActivePath(item.href);
              const badgeCount = badgeFor(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-cuelume-hover="tick"
                  data-cuelume-press
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} className="shrink-0" />
                  {t(item.labelKey)}
                  {badgeCount ? <NotificationBadge count={badgeCount} /> : null}
                </Link>
              );
            })}
            <div className="mt-1 flex flex-col gap-1 border-t border-border pt-3">
              <SidebarNotifications className="w-full" />
              <SupportDialog className="w-full" />
              <div className="flex items-center gap-0.5 pt-1">
                <ThemeToggle className="size-8 justify-center p-0" showLabel={false} />
                <SoundToggle className="size-8 justify-center p-0" showLabel={false} />
                <LanguageToggle className="size-8 justify-center p-0" showLabel={false} />
                <SignOutButton className="size-8 justify-center p-0" showLabel={false} />
              </div>
              <SidebarStatus />
            </div>
          </nav>
        </div>

        {/* The one landmark every signed-in page lacked. Screen-reader users
            had no "jump to main" target, and the skip link above needs
            something to land on. `tabIndex={-1}` makes it focusable by that
            link without adding it to the tab order; `outline-none` keeps the
            focus ring off a region the size of the page. */}
        <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col overflow-hidden outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
