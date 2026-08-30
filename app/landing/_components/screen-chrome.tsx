"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  BellIcon,
  CustomerSupportIcon,
  Globe02Icon,
  Moon02Icon,
  PanelLeftCloseIcon,
  SearchIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { NotificationBadge } from "@/components/ai-elements/notification-badge";
import { NAV_GROUPS } from "@/lib/nav-items";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Wordmark } from "./landing-header";

/**
 * The app's shell, rebuilt around the app's own parts.
 *
 * These are not screenshots and they are not lookalikes: the screens in
 * `screen-*.tsx` render the components the product renders — `Card`,
 * `KpiCard`, `SlidingTabs`, `FlowCanvas`, `ToolResult`, `Pagination` — arranged
 * the way the matching page arranges them, over a fixed demo dataset. Where the
 * app uses an outline `Button`, so do they, so a change to the button system
 * shows up here on the next build instead of drifting quietly.
 *
 * The sidebar goes further and reads `NAV_GROUPS` straight from
 * `lib/nav-items`, the same list the real sidebar and the command palette
 * share. Adding a page to the app adds it to these screens.
 *
 * Every string here runs through `useT()`, the same dictionary the rest of
 * the app reads — the landing used to pin this subtree to Spanish, but the
 * mockups now follow whatever locale the visitor has chosen, same as
 * everything else on the page.
 */

// ── Sidebar ─────────────────────────────────────────────────────────

/** Counts the real sidebar derives from live data. Fixed here so the demo
 *  agrees with the numbers the screens themselves show — three contacts
 *  parked on the inbox, eighteen conversations touched in the last hour. */
const NAV_BADGES: Record<string, number> = { "/history": 18, "/inbox": 3 };

/**
 * The app's sidebar, down to the parts that are easy to leave out and are
 * exactly what makes a fake look fake: the collapse control in the header, the
 * ⌘K row under the new-chat button, the group headings over the nav, the
 * badges on the two rows that carry them, and the whole footer stack —
 * notifications, support, the three preference toggles, and the health dot
 * with its halo.
 *
 * Below `md` it is dropped rather than squeezed, which is what the real shell
 * does at the same breakpoint.
 */
export function MockSidebar({ active }: { readonly active: string }) {
  const t = useT();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-border border-r bg-card/50 backdrop-blur-sm md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-5">
        <Wordmark />
        <span className="-mr-1 ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground">
          <HugeiconsIcon icon={PanelLeftCloseIcon} size={16} strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 px-3 pb-2">
        <span className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-sm shadow-[var(--shadow-button)]">
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} className="shrink-0" />
          {t("nav.newChat")}
        </span>
        <span className="flex w-full items-center gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-muted-foreground text-xs">
          <HugeiconsIcon icon={SearchIcon} size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="flex-1 text-left">{t("nav.search")}</span>
          <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-hidden px-3 py-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.id} className={cn("flex flex-col gap-1", groupIndex > 0 && "mt-3")}>
            {group.labelKey ? (
              <p className="px-3 pb-1 font-medium text-[11px] text-muted-foreground/60">
                {t(group.labelKey)}
              </p>
            ) : null}
            {group.items.map((item) => (
              <span
                key={item.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm",
                  item.href === active
                    ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
                    : "text-muted-foreground",
                )}
              >
                <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} className="shrink-0" />
                {t(item.labelKey)}
                {NAV_BADGES[item.href] ? <NotificationBadge count={NAV_BADGES[item.href]} /> : null}
              </span>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-border border-t p-3">
        <span className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground text-xs">
          <HugeiconsIcon icon={BellIcon} size={14} strokeWidth={1.75} className="shrink-0" />
          {t("notifications.title")}
        </span>
        <span className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground text-xs">
          <HugeiconsIcon icon={CustomerSupportIcon} size={14} strokeWidth={1.75} className="shrink-0" />
          {t("support.open")}
        </span>

        <div className="mt-1 flex items-center gap-0.5 border-border border-t pt-2">
          {[Moon02Icon, VolumeOffIcon, Globe02Icon].map((icon, index) => (
            <span
              key={index}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground"
            >
              <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
            </span>
          ))}
        </div>

        {/* The halo is the tell that the instance is answering — `SidebarStatus`
            only paints it while health reads `ok`, so leaving it off here made
            every screen look like a box that had stopped reporting. */}
        <div className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-muted-foreground text-xs">
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          {/* `environmentLabel` in the real sidebar is `process.env`'s own
              word, capitalised — always English, never translated. This
              mirrors that rather than inventing a Spanish "Producción" the
              product itself never shows. */}
          {t("nav.selfhosted", { environment: "Production" })}
        </div>
      </div>
    </aside>
  );
}

// ── Page chrome ─────────────────────────────────────────────────────

/**
 * Sidebar plus the page body. `title` renders the standard page header every
 * screen except the two workspaces — the chat and the flow editor lay out
 * their own 56px bar and have no page container at all.
 *
 * `actions` is the right-hand side of that header. Every page in the app has
 * one; a header that is only a heading is the shape none of them have.
 */
export function AppChrome({
  actions,
  active,
  children,
  pattern = false,
  subtitle,
  title,
}: {
  readonly actions?: ReactNode;
  readonly active: string;
  readonly children: ReactNode;
  /**
   * The hairline grid `PageContainer` paints behind a page body. Off by
   * default: on the landing it only earns its keep once, in the hero, where
   * there is nothing else on the screen for the eye to hold. Repeated under
   * every figure below it stops reading as texture and starts reading as
   * noise stacked behind data — five patterned rectangles down one page is
   * the thing that made the page look cheap rather than made.
   */
  readonly pattern?: boolean;
  readonly subtitle?: string;
  readonly title?: string;
}) {
  return (
    <div className="flex min-h-[600px] bg-background text-foreground">
      <MockSidebar active={active} />

      {/* The pattern gets its own layer, as it does in PageContainer:
          `bg-pattern-fade` is a mask, and a mask on the content wrapper fades
          the content with it. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {pattern ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-pattern bg-pattern-grid bg-pattern-fade opacity-30"
          />
        ) : null}
        {title ? (
          <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
            <header className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h1 className="font-semibold text-2xl">{title}</h1>
                {subtitle ? <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p> : null}
              </div>
              {actions}
            </header>
            {children}
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
        )}
      </div>
    </div>
  );
}

/**
 * The bordered `bg-card` button the app uses for every secondary page action —
 * export CSV, new contact, new chat. It is an anchor in the product and a
 * `<span>` here: these are the controls in the demo that would have to
 * navigate somewhere real, and a dead link is worse than a label.
 *
 * The two pages differ below `sm` and the difference is deliberate in both:
 * the dashboard drops its "New chat" button entirely, the inbox keeps its two
 * as bare icons. `labelBelowSm` picks which.
 */
export function HeaderAction({
  children,
  icon,
  labelBelowSm = false,
}: {
  readonly children: ReactNode;
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  /** Keep the button on a phone and hide only its label, as the inbox does. */
  readonly labelBelowSm?: boolean;
}) {
  return (
    <span
      className={cn(
        "items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 font-medium text-sm shadow-[var(--shadow-inset)]",
        labelBelowSm ? "inline-flex" : "hidden sm:inline-flex",
      )}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
      <span className={cn(labelBelowSm && "hidden sm:inline")}>{children}</span>
    </span>
  );
}
