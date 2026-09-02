"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Coins01Icon,
  CursorPointer01Icon,
  EyeIcon,
  SearchIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { CampaignRow, formatObjective, formatStatus } from "@/app/_components/ads-rows";
import { KpiBars, KpiCard, KpiSplit } from "@/app/_components/kpi-card";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/provider";
import { AppChrome } from "./screen-chrome";

/**
 * The Meta Ads page, rendered from the page's own rows.
 *
 * `CampaignRow`, `formatObjective` and `formatStatus` are imported from
 * `app/_components/ads-rows.tsx` — the same module `app/(app)/ads/page.tsx` renders.
 * The demo data below is therefore Meta's own vocabulary, enum names and minor
 * units included, and it comes out the other side as «Ventas · Activa» here
 * for exactly the reason it does in the product. A redesign of the row now
 * lands on both surfaces or on neither.
 */

// ── Formatting ──────────────────────────────────────────────────────

const LOCALE = "es-AR";

function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** `formatBudget` from the page: Meta returns budgets in minor units. */
function formatBudget(minorUnits: number): string {
  return `$${(minorUnits / 100).toLocaleString(LOCALE)}`;
}

// ── Data ────────────────────────────────────────────────────────────

type Campaign = {
  readonly budgetRemaining: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly cpm: number;
  readonly dailyBudget: number;
  readonly id: string;
  readonly impressions: number;
  readonly name: string;
  /** Meta's enum, as the API sends it — the row humanises it. */
  readonly objective: string;
  readonly reach: number;
  readonly spend: number;
  readonly status: string;
};

/**
 * Four campaigns, not six. The bottom of every screen on this page dissolves
 * into the veil; a list long enough to run under it spends its last two rows
 * being half-legible, which reads as a screenshot that was cropped badly
 * rather than as a page that continues.
 */
function useCampaigns(t: (key: string) => string): readonly Campaign[] {
  return [
    {
      budgetRemaining: 218400,
      clicks: 4128,
      conversions: 186,
      cpm: 9.9,
      dailyBudget: 600000,
      id: "c-1",
      impressions: 184212,
      name: t("landing.demo.ads.campaign1"),
      objective: "OUTCOME_SALES",
      reach: 76840,
      spend: 1824,
      status: "ACTIVE",
    },
    {
      budgetRemaining: 142000,
      clicks: 2210,
      conversions: 41,
      cpm: 10.0,
      dailyBudget: 350000,
      id: "c-2",
      impressions: 96740,
      name: t("landing.demo.ads.campaign2"),
      objective: "OUTCOME_TRAFFIC",
      reach: 41120,
      spend: 967.5,
      status: "ACTIVE",
    },
    {
      budgetRemaining: 96500,
      clicks: 1488,
      conversions: 97,
      cpm: 9.27,
      dailyBudget: 250000,
      id: "c-4",
      impressions: 62880,
      name: t("landing.demo.ads.campaign3"),
      objective: "OUTCOME_SALES",
      reach: 18960,
      spend: 583,
      status: "ACTIVE",
    },
    {
      budgetRemaining: 58000,
      clicks: 612,
      conversions: 0,
      cpm: 10.0,
      dailyBudget: 180000,
      id: "c-3",
      impressions: 41200,
      name: t("landing.demo.ads.campaign4"),
      objective: "OUTCOME_AWARENESS",
      reach: 24380,
      spend: 412,
      status: "PAUSED",
    },
  ];
}

// ── Screen ──────────────────────────────────────────────────────────

export function AdsScreen() {
  const t = useT();
  const CAMPAIGNS = useCampaigns(t);
  const [datePreset, setDatePreset] = useState("last_7d");
  /** The page opens a campaign on click; one is open here so the figure shows
   *  what a row holds instead of only showing that rows exist. */
  const [expandedId, setExpandedId] = useState<string | null>("c-1");

  const totals = useMemo(
    () =>
      CAMPAIGNS.reduce(
        (acc, campaign) => ({
          clicks: acc.clicks + campaign.clicks,
          impressions: acc.impressions + campaign.impressions,
          reach: acc.reach + campaign.reach,
          spend: acc.spend + campaign.spend,
        }),
        { clicks: 0, impressions: 0, reach: 0, spend: 0 },
      ),
    [CAMPAIGNS],
  );

  /** One metric, campaign by campaign, for the split bar under its total. */
  const split = (pick: (campaign: Campaign) => number) =>
    CAMPAIGNS.map((campaign) => ({ tone: "neutral" as const, value: pick(campaign) }));

  /** The daily ceiling the spend tile measures itself against, in major units. */
  const dailyBudgetTotal = CAMPAIGNS.reduce((sum, c) => sum + c.dailyBudget / 100, 0);

  const labels = {
    clicks: t("ads.clicks"),
    conversions: t("ads.conversions"),
    cpc: t("ads.costPerClick"),
    cpm: t("ads.cpm"),
    ctr: t("ads.ctr"),
    impressions: t("ads.impressions"),
    spend: t("ads.spend"),
  };

  return (
    <AppChrome
      active="/ads"
      title={t("ads.title")}
      subtitle={t("ads.subtitle")}
      actions={
        <Select value={datePreset} onValueChange={setDatePreset}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("ads.dateToday")}</SelectItem>
            <SelectItem value="yesterday">{t("ads.dateYesterday")}</SelectItem>
            <SelectItem value="last_7d">{t("ads.dateLast7")}</SelectItem>
            <SelectItem value="last_14d">{t("ads.dateLast14")}</SelectItem>
            <SelectItem value="last_30d">{t("ads.dateLast30")}</SelectItem>
            <SelectItem value="this_month">{t("ads.dateThisMonth")}</SelectItem>
            <SelectItem value="last_month">{t("ads.dateLastMonth")}</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {/* Tabs and search on one line, as the page has them. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <SlidingTabs
          value="campaigns"
          onValueChange={() => {}}
          tabs={[
            { id: "campaigns", label: t("ads.tabCampaigns") },
            { id: "leads", label: t("ads.tabLeads") },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <HugeiconsIcon
            icon={SearchIcon}
            size={16}
            strokeWidth={1.75}
            className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground"
          />
          <Input placeholder={t("ads.searchCampaigns")} className="pl-9" readOnly />
        </div>
      </div>

      {/* KPI totals row. Four totals, four different pictures, exactly as the
          page draws them: where the impressions came from, how the clicks were
          distributed, how much of today's budget is gone, and how much of the
          impression count was a first look. */}
      <div className="lp-kpi-row mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={EyeIcon}
          label={t("ads.impressions")}
          value={formatNumber(totals.impressions)}
          sub={t("ads.frequency", { value: (totals.impressions / totals.reach).toFixed(1) })}
          visual={<KpiSplit parts={split((c) => c.impressions)} />}
        />
        <KpiCard
          icon={CursorPointer01Icon}
          label={t("ads.clicks")}
          value={formatNumber(totals.clicks)}
          sub={t("ads.ctrSub", { value: ((totals.clicks / totals.impressions) * 100).toFixed(2) })}
          visual={<KpiSplit parts={split((c) => c.clicks)} />}
        />
        <KpiCard
          icon={Coins01Icon}
          label={t("ads.spend")}
          value={formatCurrency(totals.spend)}
          sub={t("ads.cpcSub", { value: formatCurrency(totals.spend / totals.clicks) })}
          visual={<KpiBars ratio={totals.spend / dailyBudgetTotal} />}
        />
        <KpiCard
          icon={UserGroupIcon}
          label={t("ads.reach")}
          value={formatNumber(totals.reach)}
          sub={t("ads.reachSub")}
          visual={<KpiBars ratio={totals.reach / totals.impressions} />}
        />
      </div>

      <div className="space-y-2">
        {CAMPAIGNS.map((campaign) => {
          const ctr = campaign.impressions === 0 ? 0 : (campaign.clicks / campaign.impressions) * 100;
          const cpc = campaign.clicks === 0 ? 0 : campaign.spend / campaign.clicks;
          const spent = campaign.dailyBudget - campaign.budgetRemaining;

          return (
            <CampaignRow
              expanded={expandedId === campaign.id}
              key={campaign.id}
              labels={labels}
              onToggle={() => setExpandedId(expandedId === campaign.id ? null : campaign.id)}
              view={{
                budgetCaption: t("ads.budgetSpentOf", {
                  spent: formatBudget(spent),
                  total: formatBudget(campaign.dailyBudget),
                }),
                budgetLabel: t("ads.budgetDaily"),
                budgetRatio: spent / campaign.dailyBudget,
                budgetValue: formatBudget(campaign.dailyBudget),
                clicks: formatNumber(campaign.clicks),
                conversions: formatNumber(campaign.conversions),
                cpc: formatCurrency(cpc),
                cpm: formatCurrency(campaign.cpm),
                ctr: `${ctr.toFixed(2)}%`,
                impressions: formatNumber(campaign.impressions),
                name: campaign.name,
                objective: formatObjective(campaign.objective, t),
                spend: formatCurrency(campaign.spend),
                status: campaign.status,
                statusLabel: formatStatus(campaign.status, t),
              }}
            />
          );
        })}
      </div>
    </AppChrome>
  );
}
