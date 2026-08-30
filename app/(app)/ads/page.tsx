"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Megaphone01Icon,
  SearchIcon,
  EyeIcon,
  CursorPointer01Icon,
  Coins01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import {
  CampaignRow,
  LeadRow,
  formatObjective,
  formatStatus,
} from "../../_components/ads-rows";
import { KpiBars, KpiCard, KpiSplit } from "../../_components/kpi-card";
import { Pagination } from "@/components/ai-elements/pagination";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useT } from "@/lib/i18n/provider";
import { usePolling } from "@/lib/use-polling";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";

// ── Types ──────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  created_time: string;
  updated_time: string;
};

type Insights = {
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  cpc: string;
  cpm: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
};

type Lead = {
  id: string;
  form_id: string;
  created_time: string;
  field_data: Array<{ name: string; values: string[] }>;
};

type LeadForm = {
  id: string;
  name: string;
  status: string;
};

/** Everything /api/ads can answer with. `code` only appears on the
 *  "not configured" reply, which is a 200 — see app/api/ads/route.ts. */
type AdsResponse = {
  readonly code?: string;
  readonly campaigns?: Campaign[];
  readonly insights?: Insights[];
  readonly leads?: Lead[];
  readonly forms?: LeadForm[];
};

type Tab = "campaigns" | "leads";

// ── Helpers ────────────────────────────────────────────────────────

function formatBudget(amount?: string): string {
  if (!amount) return "—";
  const num = parseInt(amount, 10);
  if (isNaN(num)) return amount;
  return `$${(num / 100).toLocaleString()}`;
}

function formatNumber(n: string): string {
  const num = parseFloat(n);
  if (isNaN(num)) return "0";
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCurrency(n: string): string {
  const num = parseFloat(n);
  if (isNaN(num)) return "$0.00";
  return `$${num.toFixed(2)}`;
}

function extractField(
  fieldData: Array<{ name: string; values: string[] }>,
  name: string,
): string {
  const field = fieldData.find((f) => f.name === name);
  return field?.values?.[0] ?? "";
}

// ── Page ───────────────────────────────────────────────────────────

export default function AdsPage() {
  const t = useT();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("campaigns");
  const [datePreset, setDatePreset] = useState("last_30d");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<Insights[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [forms, setForms] = useState<LeadForm[]>([]);
  // Two different loads. `isLoading` is the first paint of the page and owns
  // the full-page skeleton; `panelLoading` is a tab or date change, which must
  // never take the header and the tab bar down with it.
  const [isLoading, setIsLoading] = useState(true);
  const [panelLoading, setPanelLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  // Meta with no credentials can never succeed. Polling it every minute only
  // buys a repeating 400 in the console.
  const [unconfigured, setUnconfigured] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Views already fetched once this session, keyed by tab + date range. A view
  // that's been seen re-renders from state and refreshes underneath; only a
  // first visit is allowed to show placeholders.
  const loadedViews = useRef<Set<string>>(new Set());

  const load = async () => {
    const params = new URLSearchParams({ tab, date_preset: datePreset });
    const result = await fetchJson<AdsResponse>(`/api/ads?${params}`, t);
    if (!result.ok) {
      // Never the server's own sentence: `fetchJson` has already turned the
      // failure into copy that exists in both languages.
      setUnconfigured(false);
      setError(result.error);
      return;
    }
    const data = result.data;
    // "Meta isn't connected" arrives as a 200 with a code, because it is a
    // state of the install rather than a failed request.
    if (data.code === "not_configured") {
      setUnconfigured(true);
      setError({ messageKey: "ads.notConfigured" });
      return;
    }
    setError(null);
    setUnconfigured(false);
    if (tab === "campaigns") {
      setCampaigns(data.campaigns ?? []);
      setInsights(data.insights ?? []);
    } else {
      setLeads(data.leads ?? []);
      setForms(data.forms ?? []);
    }
  };

  useEffect(() => {
    const view = `${tab}:${datePreset}`;
    const seen = loadedViews.current.has(view);
    setExpandedId(null);
    if (seen) {
      // Already have rows for this view — show them and refresh in the
      // background, so switching back and forth costs nothing visually.
      void load();
      return;
    }
    setPanelLoading(true);
    void load().finally(() => {
      loadedViews.current.add(view);
      setPanelLoading(false);
      setIsLoading(false);
    });
  }, [tab, datePreset]);

  usePolling(load, 60_000, !unconfigured);

  // ── Aggregated totals ──────────────────────────────────────────

  const totals = useMemo(() => {
    return insights.reduce(
      (acc, i) => ({
        impressions: acc.impressions + parseFloat(i.impressions || "0"),
        clicks: acc.clicks + parseFloat(i.clicks || "0"),
        spend: acc.spend + parseFloat(i.spend || "0"),
        reach: acc.reach + parseFloat(i.reach || "0"),
      }),
      { impressions: 0, clicks: 0, spend: 0, reach: 0 },
    );
  }, [insights]);

  /** Every running campaign's daily budget, in major units — the ceiling the
   *  spend tile measures itself against. Meta sends minor units as strings,
   *  and a lifetime-budget campaign has no daily ceiling to add. */
  const dailyBudgetTotal = useMemo(
    () =>
      campaigns.reduce(
        (sum, c) => sum + (c.daily_budget ? parseInt(c.daily_budget, 10) / 100 : 0),
        0,
      ),
    [campaigns],
  );

  // ── Filtered ───────────────────────────────────────────────────

  const filteredCampaigns = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.objective.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q),
    );
  }, [campaigns, search]);

  const filteredLeads = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter((l) => {
      const name = extractField(l.field_data, "full_name");
      const email = extractField(l.field_data, "email");
      const phone = extractField(l.field_data, "phone_number");
      return (
        name.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        phone.includes(q)
      );
    });
  }, [leads, search]);

  // Both tabs page through the same control, so the slice is derived from
  // whichever list is on screen. Clamped on render — switching tabs or typing a
  // search can shorten the list under a page that no longer exists.
  const rows = tab === "campaigns" ? filteredCampaigns : filteredLeads;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleCampaigns = filteredCampaigns.slice(pageStart, pageStart + pageSize);
  const visibleLeads = filteredLeads.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, tab, datePreset]);

  const formNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of forms) map[f.id] = f.name;
    return map;
  }, [forms]);

  // The row components take their headings as props rather than a translator,
  // so the landing can render the same rows under its own pinned locale.
  const campaignLabels = useMemo(
    () => ({
      clicks: t("ads.clicks"),
      conversions: t("ads.conversions"),
      cpc: t("ads.costPerClick"),
      cpm: t("ads.cpm"),
      ctr: t("ads.ctr"),
      impressions: t("ads.impressions"),
      spend: t("ads.spend"),
    }),
    [t],
  );

  const leadLabels = useMemo(
    () => ({ date: t("ads.date"), form: t("ads.leadForm") }),
    [t],
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <Skeleton
        className="min-h-[400px]"
        isLoading={isLoading}
        skeleton={<div className="h-64 rounded-xl bg-muted" />}
      >
        <div className="content-enter">
          {/* Header */}
          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("ads.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("ads.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
            </div>
          </header>

          {/* "Meta isn't connected yet" is not a failure to retry — only a
              real request failure gets the retry affordance. */}
          <ErrorBanner
            className="mb-6"
            error={error}
            onRetry={unconfigured ? undefined : () => void load()}
          />

          {/* Tabs and search on one line.

              The search used to be a full-width input on a row of its own,
              between the totals and the list: a 1100px empty field sitting
              across the page for a control most visits never touch. Beside
              the tab bar it is the same control at the width it needs, and
              the list starts where the eye already is.

              It also moves out of the cross-fading panel, which is where it
              belonged: the query survives a tab change, so the field should
              not flash out and back with the rows. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <SlidingTabs
              value={tab}
              onValueChange={(next) => setTab(next as Tab)}
              tabs={[
                { id: "campaigns", label: t("ads.tabCampaigns") },
                { id: "leads", label: t("ads.tabLeads") },
              ]}
            />
            {campaigns.length > 0 || leads.length > 0 ? (
              <div className="relative w-full sm:w-64">
                <HugeiconsIcon
                  icon={SearchIcon}
                  size={16}
                  strokeWidth={1.75}
                  className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    tab === "campaigns" ? t("ads.searchCampaigns") : t("ads.searchLeads")
                  }
                  className="pl-9"
                />
              </div>
            ) : null}
          </div>

          {/* Everything below the tab bar belongs to the selected tab, so it
              is keyed by it: React swaps the subtree and the fade makes the
              change read as a panel change rather than a page load. */}
          {/* A plain cross-fade, keyed by tab. No y-offset and no layout
              animation: the two panels are different heights (different
              empty-state copy, and only campaigns carries the totals row),
              and animating that height means scaling the container — which
              stretches every card inside it for the length of the swap.
              Fading in place is the one version that doesn't distort. */}
          <motion.div
            key={panelLoading ? `${tab}-loading` : tab}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
          {panelLoading ? (
            <AdsPanelSkeleton tab={tab} />
          ) : (
          <>
          {/* Totals (campaigns only).

              The four raw totals say almost nothing next to each other — 100k
              impressions is good or terrible depending on the click rate. Each
              second line carries the ratio that gives its number a verdict:
              frequency, CTR, cost per click. */}
          {tab === "campaigns" && campaigns.length > 0 && !error && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: EyeIcon,
                  label: t("ads.impressions"),
                  sub:
                    totals.reach > 0
                      ? t("ads.frequency", {
                          value: (totals.impressions / totals.reach).toFixed(1),
                        })
                      : t("ads.reachSub"),
                  value: formatNumber(String(totals.impressions)),
                  visual: (
                    <KpiSplit
                      parts={insights.map((i) => ({
                        tone: "neutral" as const,
                        value: parseFloat(i.impressions || "0"),
                      }))}
                    />
                  ),
                },
                {
                  icon: CursorPointer01Icon,
                  label: t("ads.clicks"),
                  sub:
                    totals.impressions > 0
                      ? t("ads.ctrSub", {
                          value: ((totals.clicks / totals.impressions) * 100).toFixed(2),
                        })
                      : t("ads.noClicksYet"),
                  value: formatNumber(String(totals.clicks)),
                  visual: (
                    <KpiSplit
                      parts={insights.map((i) => ({
                        tone: "neutral" as const,
                        value: parseFloat(i.clicks || "0"),
                      }))}
                    />
                  ),
                },
                {
                  icon: Coins01Icon,
                  label: t("ads.spend"),
                  sub:
                    totals.clicks > 0
                      ? t("ads.cpcSub", {
                          value: formatCurrency(String(totals.spend / totals.clicks)),
                        })
                      : t("ads.noClicksYet"),
                  value: formatCurrency(String(totals.spend)),
                  // Spend against the budget it is allowed to spend, which
                  // is the one thing about a spend figure anybody checks.
                  visual: (
                    <KpiBars
                      ratio={dailyBudgetTotal > 0 ? totals.spend / dailyBudgetTotal : 0}
                      tone={
                        dailyBudgetTotal > 0 && totals.spend / dailyBudgetTotal > 0.9
                          ? "warning"
                          : "neutral"
                      }
                    />
                  ),
                },
                {
                  icon: UserGroupIcon,
                  label: t("ads.reach"),
                  sub: t("ads.reachSub"),
                  value: formatNumber(String(totals.reach)),
                  // How much of the impression count was a new person. The
                  // inverse of frequency, and the reason reach and
                  // impressions are two numbers rather than one.
                  visual: (
                    <KpiBars
                      ratio={totals.impressions > 0 ? totals.reach / totals.impressions : 0}
                    />
                  ),
                },
              ].map((stat) => (
                /* Four totals, four different pictures, because the four
                   numbers raise four different questions: which campaigns
                   the volume came from, how the clicks were distributed,
                   how much of today's budget is gone, and how much of the
                   impression count was a person seeing the ad for the first
                   time. */
                <KpiCard
                  icon={stat.icon}
                  key={stat.label}
                  label={stat.label}
                  sub={stat.sub}
                  value={stat.value}
                  visual={stat.visual}
                />
              ))}
            </div>
          )}

          {/* Campaigns tab */}
          {tab === "campaigns" && (
            <>
              {filteredCampaigns.length === 0 ? (
                <Card>
                  <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                      <HugeiconsIcon
                        icon={Megaphone01Icon}
                        size={20}
                        strokeWidth={1.75}
                      />
                    </div>
                    <p className="text-sm font-medium">{t("ads.emptyCampaigns")}</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {t("ads.emptyCampaignsHint")}
                    </p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-2">
                  {visibleCampaigns.map((campaign, idx) => {
                    const insight = insights[idx];
                    const spend = parseFloat(insight?.spend ?? "0");
                    const clicks = parseFloat(insight?.clicks ?? "0");
                    const impressions = parseFloat(insight?.impressions ?? "0");
                    // Meta sends one budget or the other, never both, and in
                    // minor units. `budget_remaining` is what is left of it
                    // today, so the bar is the share already delivered.
                    const budgetMinor = campaign.daily_budget ?? campaign.lifetime_budget;
                    const total = budgetMinor ? parseInt(budgetMinor, 10) : NaN;
                    const left = campaign.budget_remaining
                      ? parseInt(campaign.budget_remaining, 10)
                      : NaN;
                    const hasBar = Number.isFinite(total) && total > 0 && Number.isFinite(left);
                    return (
                      <CampaignRow
                        expanded={expandedId === campaign.id}
                        key={campaign.id}
                        labels={campaignLabels}
                        onToggle={() =>
                          setExpandedId(expandedId === campaign.id ? null : campaign.id)
                        }
                        view={{
                          budgetCaption: hasBar
                            ? t("ads.budgetSpentOf", {
                                spent: formatBudget(String(total - left)),
                                total: formatBudget(String(total)),
                              })
                            : null,
                          budgetLabel: campaign.daily_budget
                            ? t("ads.budgetDaily")
                            : t("ads.budgetLifetime"),
                          budgetRatio: hasBar ? (total - left) / total : null,
                          budgetValue: formatBudget(budgetMinor),
                          clicks: formatNumber(insight?.clicks ?? "0"),
                          conversions: formatNumber(
                            insight?.actions?.find((a) => a.action_type === "purchase")?.value ??
                              "0",
                          ),
                          cpc: formatCurrency(
                            insight?.cpc ?? String(clicks > 0 ? spend / clicks : 0),
                          ),
                          cpm: formatCurrency(insight?.cpm ?? "0"),
                          ctr: `${(insight?.ctr
                            ? parseFloat(insight.ctr)
                            : impressions > 0
                              ? (clicks / impressions) * 100
                              : 0
                          ).toFixed(2)}%`,
                          impressions: formatNumber(insight?.impressions ?? "0"),
                          name: campaign.name,
                          objective: formatObjective(campaign.objective, t),
                          spend: formatCurrency(insight?.spend ?? "0"),
                          status: campaign.status,
                          statusLabel: formatStatus(campaign.status, t),
                        }}
                      />
                    );
                  })}
                  <Pagination
                    className="pt-3"
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    page={currentPage}
                    pageCount={pageCount}
                    pageSize={pageSize}
                  />
                </div>
              )}
            </>
          )}

          {/* Leads tab */}
          {tab === "leads" && (
            <>
              {filteredLeads.length === 0 ? (
                <Card>
                  <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                      <HugeiconsIcon
                        icon={Megaphone01Icon}
                        size={20}
                        strokeWidth={1.75}
                      />
                    </div>
                    <p className="text-sm font-medium">{t("ads.emptyLeads")}</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      {t("ads.emptyLeadsHint")}
                    </p>
                  </div>
                </Card>
              ) : (
                <div className="space-y-2">
                  {visibleLeads.map((lead) => {
                    const name = extractField(lead.field_data, "full_name");
                    const email = extractField(lead.field_data, "email");
                    const phone = extractField(lead.field_data, "phone_number");
                    const created = new Date(lead.created_time);
                    return (
                      <LeadRow
                        expanded={expandedId === lead.id}
                        key={lead.id}
                        labels={leadLabels}
                        onToggle={() =>
                          setExpandedId(expandedId === lead.id ? null : lead.id)
                        }
                        view={{
                          contact: email || phone || lead.id,
                          date: created.toLocaleString(),
                          fields: lead.field_data.map((field) => ({
                            name: field.name,
                            value: field.values.join(", "),
                          })),
                          form: formNameMap[lead.form_id] ?? lead.form_id,
                          name: name || t("ads.unknownLead"),
                          time: created.toLocaleDateString(),
                        }}
                      />
                    );
                  })}
                  <Pagination
                    className="pt-3"
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    page={currentPage}
                    pageCount={pageCount}
                    pageSize={pageSize}
                  />
                </div>
              )}
            </>
          )}
          </>
          )}
          </motion.div>
        </div>
      </Skeleton>
    </PageContainer>
  );
}

/** Placeholder for a tab that's never been loaded. Only the panel — the
 *  header, the date picker and the tab bar stay on screen. */
function AdsPanelSkeleton({ tab }: { readonly tab: Tab }) {
  return (
    <div className="animate-pulse space-y-3">
      {/* Only the campaigns tab carries the totals row, so only its
          placeholder does. */}
      {tab === "campaigns" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              {/* The tile's own shape: number, context line, picture, label. */}
              <div className="space-y-2 p-5">
                <SkeletonBar className="h-7" width="70%" />
                <SkeletonBar className="h-3" width="45%" />
                <SkeletonBar className="!mt-4 h-2 w-full rounded-full" />
                <SkeletonBar className="!mt-4 h-3" width="40%" />
              </div>
            </Card>
          ))}
        </div>
      ) : null}
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <div className="flex items-center gap-4 px-5 py-4">
            <SkeletonBar className="size-1.5 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-3.5" width="40%" />
              <SkeletonBar className="h-3" width="25%" />
            </div>
            {/* The metric columns, so the placeholder has the row's shape and
                the real rows do not jump sideways when they land. */}
            <div className="hidden items-center gap-6 xl:flex">
              <SkeletonBar className="h-3.5 w-[86px]" />
              <SkeletonBar className="h-3.5 w-[86px]" />
              <SkeletonBar className="h-3.5 w-[62px]" />
            </div>
            <SkeletonBar className="hidden h-3.5 w-[92px] sm:block" />
          </div>
        </Card>
      ))}
    </div>
  );
}
