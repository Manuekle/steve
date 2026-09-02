"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useT } from "@/lib/i18n/provider";
import { Wordmark } from "./landing-header";
import { Shell } from "./primitives";

/**
 * Every link here points at a route this app actually serves. A marketing
 * footer full of dead anchors is the fastest way to make a product look like
 * a template, so there is no "Careers", no "Blog" and no social row.
 */
const COLUMNS: readonly {
  readonly links: readonly { readonly href: string; readonly labelKey: string }[];
  readonly titleKey: string;
}[] = [
  {
    titleKey: "landing.footer.colProduct",
    links: [
      { href: "/dashboard", labelKey: "nav.dashboard" },
      { href: "/inbox", labelKey: "nav.inbox" },
      { href: "/history", labelKey: "nav.chats" },
      { href: "/automations", labelKey: "nav.automations" },
      { href: "/calendar", labelKey: "nav.calendar" },
    ],
  },
  /* The CRM group as the sidebar has it, plus Meta Ads — which is where the
     leads in it come from, and which had a column of its own with one link in
     it. `nav.groupCrm` is the sidebar's own heading for these, so the footer
     and the product call the same set of pages the same thing. */
  {
    titleKey: "nav.groupCrm",
    links: [
      { href: "/crm", labelKey: "nav.crm" },
      { href: "/leads", labelKey: "nav.leads" },
      { href: "/forms", labelKey: "nav.forms" },
      { href: "/ads", labelKey: "nav.ads" },
    ],
  },
  {
    titleKey: "landing.footer.colAgents",
    links: [
      { href: "/chat", labelKey: "nav.chat" },
      { href: "/agents", labelKey: "nav.agents" },
      { href: "/knowledge", labelKey: "nav.knowledge" },
      { href: "/email-templates", labelKey: "nav.emailTemplates" },
      { href: "/reminders", labelKey: "nav.reminders" },
    ],
  },
  {
    titleKey: "landing.footer.colSystem",
    links: [
      { href: "/connections", labelKey: "nav.connections" },
      { href: "/account", labelKey: "nav.account" },
      { href: "/settings", labelKey: "nav.settings" },
      { href: "/setup", labelKey: "nav.setup" },
      { href: "/guide", labelKey: "landing.footer.linkGuide" },
    ],
  },
  {
    titleKey: "landing.footer.colLegal",
    links: [
      { href: "/pricing", labelKey: "landing.header.linkPricing" },
      { href: "/terms", labelKey: "landing.footer.linkTerms" },
      { href: "/privacy", labelKey: "landing.footer.linkPrivacy" },
    ],
  },
];

export function LandingFooter() {
  const t = useT();

  return (
    <footer className="border-border border-t py-14">
      <Shell>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-1">
            <Wordmark />
            <p className="mt-3 max-w-[24ch] text-[13px] leading-relaxed text-muted-foreground">
              {t("landing.footer.tagline")}
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.titleKey}>
              <h3 className="font-medium text-[13px] text-foreground">{t(column.titleKey)}</h3>
              <ul className="mt-3 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href + link.labelKey}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-border border-t pt-6">
          <p className="max-w-[46ch] text-[12px] text-muted-foreground">{t("landing.footer.builtOn")}</p>

          {/* The same two controls the sidebar carries, in the place a site
              puts its preferences. They are the app's own components, so the
              behaviour, the tooltips and the keyboard handling are the ones
              the product already has.

              The theme one repaints this page: the marketing surface follows
              `<html>` now. The language one does too — the marketing copy runs
              through the same dictionary as the rest of the app, so switching
              it here retranslates the whole page, landing included.
              `showLabel` is on because a footer has the room, and a bare globe
              in a corner is a control nobody clicks. */}
          <div className="-mx-2.5 flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </div>
      </Shell>
    </footer>
  );
}
