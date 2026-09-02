"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Call02Icon,
  Globe02Icon,
  Mail01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { BusinessIdentity, BusinessProfileRecord } from "@/lib/business-profile-store";
import { Card, CardDescription, CardHeader, CardSeparator, CardTitle } from "../../../_components/dashboard-card";
import { BusinessIdentityForm, LogoPreview } from "./business-identity-form";
import { BusinessLegalForm } from "./business-legal-form";
import { BusinessProfilePanel } from "./business-profile-panel";

/**
 * Everything about the business the agent works for, in one card at the top of
 * the Conocimiento page: the details the owner typed in, the AI summary
 * generated from their site, and the terms and privacy pages.
 *
 * Three tabs rather than three cards because this sits above the document
 * library, and a page whose first screen is all configuration buries the thing
 * people came for. The header stays visible across all three so the card also
 * works as the at-a-glance view of the business.
 */

type Tab = "identity" | "profile" | "legal";

/** Mirrors `emptyIdentity()` in the store, which is server-only — importing it
 *  would drag node:fs into the browser bundle. Only ever on screen for the
 *  moment before the first load answers. */
function blankIdentity(): BusinessIdentity {
  return {
    name: "",
    description: "",
    websiteUrl: "",
    email: "",
    phone: "",
    address: "",
    hours: "",
    logo: null,
    terms: null,
    privacy: null,
    updatedAt: null,
  };
}

const TABS = [
  { id: "identity", labelKey: "business.tabIdentity" },
  { id: "profile", labelKey: "business.tabProfile" },
  { id: "legal", labelKey: "business.tabLegal" },
] as const satisfies readonly { id: Tab; labelKey: string }[];

export function BusinessCard() {
  const { t } = useI18n();

  const [identity, setIdentity] = useState<BusinessIdentity>(blankIdentity);
  const [record, setRecord] = useState<BusinessProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("identity");

  const load = useCallback(async () => {
    const result = await fetchJson<{ record: BusinessProfileRecord | null; identity: BusinessIdentity }>(
      "/api/business-profile",
      t,
    );
    if (result.ok) {
      setRecord(result.data.record);
      setIdentity(result.data.identity);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // The generated profile fills the header in until the owner types their own
  // name — arriving from onboarding with an analyzed site and a blank header
  // would read as if nothing had been saved.
  const displayName = identity.name || record?.profile.name || "";
  const displayDescription = identity.description || record?.profile.description || "";

  return (
    <Card className="mb-6">
      <CardHeader>
        {loading ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={Store01Icon} size={17} strokeWidth={1.75} />
          </div>
        ) : (
          <LogoPreview identity={identity} className="size-11" />
        )}
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="space-y-2 py-1">
              <SkeletonBar className="h-4 w-40" />
              <SkeletonBar className="h-3 w-64" />
            </div>
          ) : (
            <>
              <CardTitle>{displayName || t("business.title")}</CardTitle>
              <CardDescription className="line-clamp-2">
                {displayDescription || t("business.subtitle")}
              </CardDescription>
              <ContactChips identity={identity} />
            </>
          )}
        </div>
      </CardHeader>
      <CardSeparator />

      <div className="space-y-4 px-5 py-4">
        {loadFailed ? <ErrorBanner messageKey="business.loadFailed" onRetry={() => void load()} /> : null}

        <SlidingTabs
          tabs={TABS.map(({ id, labelKey }) => ({ id, label: t(labelKey) }))}
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
        />

        {loading ? (
          <div className="space-y-3 py-2">
            <SkeletonBar className="h-9 w-full rounded-lg" />
            <SkeletonBar className="h-9 w-3/4 rounded-lg" />
          </div>
        ) : tab === "identity" ? (
          <BusinessIdentityForm identity={identity} onChange={setIdentity} />
        ) : tab === "profile" ? (
          <BusinessProfilePanel record={record} onChange={setRecord} />
        ) : (
          <BusinessLegalForm identity={identity} onChange={setIdentity} />
        )}
      </div>
    </Card>
  );
}

/** The contact details, as one line under the name — the point of the header
 *  is that the owner can check what the agent knows without opening a tab. */
function ContactChips({ identity }: { readonly identity: BusinessIdentity }) {
  const chips = [
    identity.websiteUrl
      ? { icon: Globe02Icon, label: identity.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") }
      : null,
    identity.email ? { icon: Mail01Icon, label: identity.email } : null,
    identity.phone ? { icon: Call02Icon, label: identity.phone } : null,
  ].filter((chip): chip is { icon: typeof Globe02Icon; label: string } => chip !== null);

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {chips.map((chip) => (
        <span key={chip.label} className="flex min-w-0 items-center gap-1.5">
          <HugeiconsIcon icon={chip.icon} size={13} strokeWidth={1.75} />
          <span className="truncate">{chip.label}</span>
        </span>
      ))}
    </div>
  );
}
