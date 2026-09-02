"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  ChartAverageIcon,
  MessageCircleIcon,
  SendIcon,
  TrendingUpIcon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { Card, CardDescription, CardHeader, CardSeparator, CardTitle } from "@/app/_components/dashboard-card";
import { KpiBars, KpiCard, KpiSparkline, KpiSplit } from "@/app/_components/kpi-card";
import { ChannelBadge, ChannelIcon, ChannelStatusBadge, CHANNEL_LABELS } from "@/app/_components/channel-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/provider";
import type { ChannelId, ChannelStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AppChrome, HeaderAction } from "./screen-chrome";

/**
 * The dashboard, as `app/(app)/dashboard/page.tsx` renders it: the four KPI tiles,
 * the week's bars beside the channel split, the three channel cards, and the
 * recent conversations. Everything below the chart lives under the frame's
 * veil, which is the point — a page that ends exactly where the blur starts
 * reads as a crop of a screenshot rather than as a screen that carries on.
 *
 * The bars are the interactive part, and they are interactive in the app for
 * the same reason: a bar's height is a comparison, and the number behind it
 * only exists in the tooltip.
 */

// ── Data ────────────────────────────────────────────────────────────

/** `day.mon`…`day.sun`, the keys `getActivityData` emits, so the axis reads
 *  "Lun Mar Mié…" here exactly as it does in the product. The single letters
 *  this used to show were a label the app has never rendered. */
const ACTIVITY: readonly { readonly labelKey: string; readonly value: number }[] = [
  { labelKey: "day.mon", value: 128 },
  { labelKey: "day.tue", value: 174 },
  { labelKey: "day.wed", value: 143 },
  { labelKey: "day.thu", value: 201 },
  { labelKey: "day.fri", value: 268 },
  { labelKey: "day.sat", value: 189 },
  { labelKey: "day.sun", value: 96 },
];

const BREAKDOWN: readonly {
  readonly channel: ChannelId;
  readonly count: number;
  readonly percentage: number;
}[] = [
  { channel: "whatsapp", count: 742, percentage: 72 },
  { channel: "instagram", count: 289, percentage: 28 },
];

const CHANNEL_CARDS: readonly {
  readonly id: ChannelId;
  readonly messageCount: number;
  readonly status: ChannelStatus;
  readonly when: string;
}[] = [
  { id: "whatsapp", messageCount: 2984, status: "connected", when: "2m" },
  { id: "instagram", messageCount: 1162, status: "connected", when: "9m" },
];

/** `relativeTime` renders "2m" / "3h" / "1d" — never "hace 2 min", which is
 *  the phrasing this table used to invent. */
function useRecent(t: (key: string) => string): readonly {
  readonly channel: ChannelId;
  readonly last: string;
  readonly messageCount: number;
  readonly title: string;
  readonly when: string;
}[] {
  return [
    {
      channel: "whatsapp",
      last: t("landing.demo.msg.maria"),
      messageCount: 6,
      title: "María Fernández",
      when: "2m",
    },
    {
      channel: "instagram",
      last: t("landing.demo.msg.lucia"),
      messageCount: 4,
      title: "Lucía Romero",
      when: "6m",
    },
    {
      channel: "whatsapp",
      last: t("landing.demo.msg.carlos"),
      messageCount: 9,
      title: "Carlos Ruiz",
      when: "11m",
    },
    {
      channel: "instagram",
      last: t("landing.demo.msg.diego"),
      messageCount: 3,
      title: "Diego Salas",
      when: "24m",
    },
    {
      channel: "whatsapp",
      last: t("landing.demo.msg.paula"),
      messageCount: 5,
      title: "Paula Ibáñez",
      when: "38m",
    },
  ];
}

// ── Activity chart ──────────────────────────────────────────────────

const CHART_HEIGHT = 148;

/**
 * `ActivityChart` from the dashboard, kept to its own measurements: 148px of
 * plot, dashed lines at zero / midpoint / peak, a full-height track behind
 * every column so an empty day still reads as a comparison, the peak drawn
 * solid, and the peak's axis label in foreground weight.
 *
 * The bars are `Tooltip` triggers here as they are there — hovering one is the
 * only way to read the day's number, and a chart of unlabelled bars is a
 * picture of a chart.
 */
function ActivityChart() {
  const t = useT();
  const max = Math.max(...ACTIVITY.map((point) => point.value));

  return (
    <div>
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {[0, 0.5, 1].map((fraction) => (
            <div
              key={fraction}
              className="absolute inset-x-0 border-border border-t border-dashed"
              style={{ bottom: `${fraction * 100}%` }}
            >
              <span className="-top-2 -translate-x-full absolute left-0 pr-2 text-[10px] text-muted-foreground/45 tabular-nums">
                {Math.round(max * fraction)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex h-full items-end gap-1.5 sm:gap-2">
          {ACTIVITY.map((point) => {
            const isPeak = point.value === max;
            return (
              <Tooltip key={point.labelKey}>
                <TooltipTrigger asChild>
                  <button
                    className="group relative flex h-full flex-1 items-end rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    type="button"
                  >
                    <span className="absolute inset-0 rounded-lg bg-foreground/[0.035] transition-colors duration-150 group-hover:bg-foreground/[0.07]" />
                    <span
                      className={cn(
                        "relative w-full rounded-t-lg bg-gradient-to-t transition-[filter,opacity] duration-150",
                        isPeak
                          ? "from-foreground/70 to-foreground"
                          : "from-foreground/25 to-foreground/45 group-hover:from-foreground/40 group-hover:to-foreground/65",
                      )}
                      style={{ height: `${Math.max((point.value / max) * 100, 6)}%` }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span className="font-medium tabular-nums">{point.value}</span>{" "}
                  {t("dashboard.messages")} · {t(point.labelKey)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 flex gap-1.5 sm:gap-2">
        {ACTIVITY.map((point) => (
          <div key={point.labelKey} className="flex-1 text-center">
            <p
              className={cn(
                "text-[11px] tabular-nums",
                point.value === max ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {t(point.labelKey)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Screen ──────────────────────────────────────────────────────────

export function DashboardScreen() {
  const t = useT();
  const recent = useRecent(t);
  const total = ACTIVITY.reduce((sum, point) => sum + point.value, 0);

  return (
    <AppChrome
      active="/dashboard"
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      actions={<HeaderAction icon={Add01Icon}>{t("dashboard.newChat")}</HeaderAction>}
    >
      {/* Same four pictures the page draws: the live share of the book, where
          the volume came from, how much of it never needed a person, and the
          curve the average is taken over. */}
      <div className="lp-kpi-row mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={MessageCircleIcon}
          label={t("dashboard.conversations")}
          value="1.199"
          sub={t("dashboard.activeNow", { count: "18" })}
          visual={<KpiBars ratio={18 / 120} tone="positive" />}
        />
        <KpiCard
          icon={SendIcon}
          label={t("dashboard.messagesTotal")}
          value="4.812"
          sub={t("dashboard.leadChannel", { channel: CHANNEL_LABELS.whatsapp, percentage: "62" })}
          visual={
            <KpiSplit
              parts={[
                { tone: "neutral", value: 62 },
                { tone: "neutral", value: 21 },
                { tone: "neutral", value: 11 },
                { tone: "neutral", value: 6 },
              ]}
            />
          }
        />
        <KpiCard
          icon={ZapIcon}
          label={t("dashboard.autoReplies")}
          value="3.640"
          sub={t("dashboard.activeAutomations", { count: "7" })}
          visual={<KpiBars ratio={3640 / 4812} />}
        />
        <KpiCard
          icon={ChartAverageIcon}
          label={t("dashboard.messagesPerChat")}
          value="4"
          sub={t("dashboard.overChats", { count: "1.199" })}
          visual={
            <KpiSparkline points={[3.1, 3.4, 3.2, 3.9, 4.4, 4.1, 4.6, 4.2, 4.8, 5.1, 4.7, 5.3]} />
          }
        />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={TrendingUpIcon} size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>{t("dashboard.weeklyActivity")}</CardTitle>
              <CardDescription>{t("dashboard.messagesByDay")}</CardDescription>
            </div>
            <p className="shrink-0 font-semibold text-lg leading-none tabular-nums">{total}</p>
          </CardHeader>
          <CardSeparator />
          <div className="py-6 pr-5 pl-10">
            <ActivityChart />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={MessageCircleIcon} size={16} strokeWidth={1.75} />
            </div>
            <div>
              <CardTitle>{t("dashboard.channels")}</CardTitle>
              <CardDescription>{t("dashboard.channelBreakdown")}</CardDescription>
            </div>
          </CardHeader>
          <CardSeparator />
          <div className="space-y-4 px-5 py-4">
            {BREAKDOWN.map((row) => (
              <div key={row.channel}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <ChannelBadge channel={row.channel} />
                  <span className="text-muted-foreground tabular-nums">
                    {row.count} ({row.percentage}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted shadow-[var(--shadow-inset)]">
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${row.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Channel status. Half of this sits under the veil, which is what the
          section wants: the screen has to look like it continues. */}
      <div className="mb-8">
        <h2 className="mb-4 font-medium text-sm">{t("dashboard.channelStatus")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CHANNEL_CARDS.map((channel) => (
            <Card key={channel.id} interactive>
              <CardHeader>
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <ChannelIcon channel={channel.id} />
                </div>
                <div className="flex-1">
                  <CardTitle>{CHANNEL_LABELS[channel.id]}</CardTitle>
                  <CardDescription>
                    {channel.messageCount} {t("dashboard.messages")} · {channel.when}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardSeparator />
              <div className="px-5 py-3">
                <ChannelStatusBadge status={channel.status} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium text-sm">{t("dashboard.recentChats")}</h2>
          <span className="text-muted-foreground text-xs">{t("dashboard.viewAll")}</span>
        </div>
        <Card>
          <div className="divide-y divide-border">
            {recent.map((chat) => (
              <div key={chat.title} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <ChannelIcon channel={chat.channel} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{chat.title}</p>
                  <p className="truncate text-muted-foreground text-xs">{chat.last}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-muted-foreground text-xs tabular-nums">{chat.when}</p>
                  <p className="mt-0.5 text-muted-foreground/60 text-xs tabular-nums">
                    {chat.messageCount} {t("dashboard.messages")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppChrome>
  );
}
