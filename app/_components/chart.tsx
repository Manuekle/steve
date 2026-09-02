"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The chart layer.
 *
 * Two forms cover every quantitative comparison this product actually makes:
 * a ranked horizontal bar for "which of these is biggest" (providers by cost,
 * leads by source, pipeline by stage) and a time series for "how did this move"
 * (messages per day, spend per day). Both were being re-typed by hand on each
 * page — the dashboard, the AI-usage breakdowns and the ads tiles each grew
 * their own bar with its own scale, its own empty state and its own idea of
 * what grey means. They are one component each now.
 *
 * No charting library. Every series here is under thirty marks, the palette is
 * achromatic by design, and a grammar runtime would cost more in bundle and in
 * fighting its default palette than the maths it saves — which is one division.
 * The moment a surface needs brushing, zoom, or a few hundred points, that is
 * the moment to reach for a real renderer, and it should live behind these same
 * props.
 *
 * React owns the container, the labels, the axis and the tooltip. This file
 * owns geometry: a value in, a mark out. Both components are deterministic and
 * measure nothing, so they render identically on the server and after
 * hydration; they carry `"use client"` only because the tooltip does.
 */

// ── Colour roles ────────────────────────────────────────────────────

/**
 * Roles, not colours. `neutral` is context and is the default for every
 * quantity that is just a quantity; the accents are reserved for a value that
 * carries a judgement — money burnt, a target missed, a lead won — so that a
 * coloured mark on a page of grey ones always means something.
 */
export type ChartTone = "critical" | "neutral" | "positive" | "warning";

export const CHART_TONE_FILL: Readonly<Record<ChartTone, string>> = {
  critical: "bg-rose-500/70",
  neutral: "bg-foreground/45",
  positive: "bg-emerald-500/70",
  warning: "bg-amber-500/70",
};

export const CHART_TONE_STROKE: Readonly<Record<ChartTone, string>> = {
  critical: "text-rose-500",
  neutral: "text-foreground/45",
  positive: "text-emerald-500",
  warning: "text-amber-500",
};

// ── Ranked bars ─────────────────────────────────────────────────────

export type RankedBar = {
  readonly key: string;
  /** Rendered as given, so a row can carry a channel icon or a provider logo. */
  readonly label: ReactNode;
  /** Pre-formatted for display — currency, a count, a percentage. */
  readonly formatted: string;
  /** What the bar is scaled by. Negative values are clamped to zero. */
  readonly value: number;
  readonly tone?: ChartTone;
};

/**
 * A ranked horizontal bar list.
 *
 * Sorted descending, because the ranking is the point — an unsorted bar list
 * makes the reader do the comparison the chart was supposed to do. Bars are
 * scaled against the largest value rather than the total, so the leader always
 * fills the row and a long tail of small values stays legible instead of
 * collapsing into slivers.
 *
 * Labels sit on the bar's own line rather than in a legend: with six rows the
 * eye travel of a legend lookup costs more than the space it saves.
 */
export function RankedBars({
  bars,
  emptyLabel,
  limit = 6,
  tone = "neutral",
}: {
  readonly bars: readonly RankedBar[];
  readonly emptyLabel: string;
  /** Rows past this are dropped; six is where a ranked list stops being read. */
  readonly limit?: number;
  /** Fallback for rows that do not set their own. */
  readonly tone?: ChartTone;
}) {
  const ranked = [...bars].sort((a, b) => b.value - a.value).slice(0, limit);
  const max = Math.max(...ranked.map((bar) => Math.max(bar.value, 0)), 0);

  // No rows is empty. Rows that are all zero is not: knowing that the spend is
  // split across three providers and every one of them is at zero is an
  // answer, and hiding the names behind an empty state loses it.
  if (ranked.length === 0) {
    return <p className="text-muted-foreground text-xs">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2.5">
      {ranked.map((bar, index) => {
        const barTone = bar.tone ?? tone;
        // Zero keeps a hairline so the row reads as "none" rather than as a
        // bar that failed to draw.
        const percent = max === 0 ? 0 : Math.max((Math.max(bar.value, 0) / max) * 100, 1.5);
        return (
          <div key={bar.key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium">{bar.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{bar.formatted}</span>
            </div>
            <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", CHART_TONE_FILL[barTone])}
                style={{
                  /* Neutral rows step down with rank so the list reads as an
                     order rather than as one grey repeated. Toned rows keep
                     their weight — a row is coloured because it matters. */
                  opacity: barTone === "neutral" ? Math.max(0.35, 1 - index * 0.13) : undefined,
                  width: `${percent}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Time series ─────────────────────────────────────────────────────

export type TimePoint = {
  readonly key: string;
  /** The axis tick. Kept short — a bucket label is read in passing. */
  readonly label: string;
  readonly value: number;
};

/**
 * Bucketed volume over time.
 *
 * Every column is a full-height track, so the period reads as a comparison even
 * where a bucket is empty, with the fill scaled against the busiest one. The
 * busiest bucket is drawn solid and the rest sit back, which is what gives the
 * row a shape instead of a flat fence of identical bars.
 *
 * Reference lines at the peak and its midpoint carry the scale; without them a
 * tall bar means nothing. Each column is a real button, so the series is
 * reachable by keyboard and its values are not hover-only.
 */
export function TimeSeries({
  data,
  emptyLabel,
  formatValue,
  height = 148,
  tone = "neutral",
}: {
  readonly data: readonly TimePoint[];
  readonly emptyLabel: string;
  /** Tooltip body for one bucket — "128 mensajes · Martes". */
  readonly formatValue: (point: TimePoint) => ReactNode;
  readonly height?: number;
  readonly tone?: ChartTone;
}) {
  const max = Math.max(...data.map((point) => point.value), 1);
  const total = data.reduce((sum, point) => sum + point.value, 0);
  /* Seven ticks is what a phone fits. Past that the axis thins out rather than
     letting fourteen dates overlap into a grey smear — every column keeps its
     bar and its tooltip, only the printed tick is dropped. The peak always
     keeps its label: it is the one value the reader is looking for. */
  const tickStride = Math.ceil(data.length / 7);

  if (data.length === 0 || total === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground/60 text-xs"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div>
      <div className="relative" style={{ height }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {[0, 0.5, 1].map((fraction) => (
            <div
              className="absolute inset-x-0 border-border border-t border-dashed"
              key={fraction}
              style={{ bottom: `${fraction * 100}%` }}
            >
              <span className="-top-2 -translate-x-full absolute left-0 pr-2 text-[10px] text-muted-foreground/45 tabular-nums">
                {Math.round(max * fraction)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex h-full items-end gap-1.5 sm:gap-2">
          {data.map((point, index) => {
            const isPeak = point.value === max && point.value > 0;
            // Zero still gets a sliver so the column reads as "nothing here"
            // rather than as a rendering gap.
            const percent = point.value === 0 ? 1.5 : Math.max((point.value / max) * 100, 6);
            return (
              <Tooltip key={point.key}>
                <TooltipTrigger asChild>
                  <button
                    className="group relative flex h-full flex-1 items-end rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    type="button"
                  >
                    <span className="absolute inset-0 rounded-lg bg-foreground/[0.035] transition-colors duration-150 group-hover:bg-foreground/[0.07]" />
                    <span
                      className={cn(
                        // Square bottom: the fill sits on the baseline, so a
                        // rounded foot would float it off the axis.
                        "chart-bar relative w-full rounded-t-lg transition-[filter,opacity] duration-150",
                        tone === "neutral"
                          ? cn(
                              "bg-gradient-to-t",
                              isPeak
                                ? "from-foreground/70 to-foreground"
                                : "from-foreground/25 to-foreground/45 group-hover:from-foreground/40 group-hover:to-foreground/65",
                            )
                          : cn(CHART_TONE_FILL[tone], isPeak ? "opacity-100" : "opacity-60 group-hover:opacity-85"),
                      )}
                      style={{
                        height: `${percent}%`,
                        animationDelay: `${index * 45}ms`,
                      }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{formatValue(point)}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Axis labels sit outside the plot so the bars all share one baseline. */}
      <div className="mt-2.5 flex gap-1.5 sm:gap-2">
        {data.map((point, index) => {
          const isPeak = point.value === max;
          const shows = isPeak || index % tickStride === 0;
          return (
            <div className="min-w-0 flex-1 text-center" key={point.key}>
              {/* A printed tick is allowed to spill past its own column: the
                  columns either side of it are blank by construction, so the
                  date reads in full instead of being clipped to "20 …". */}
              <p
                className={cn(
                  "overflow-visible whitespace-nowrap text-[11px] tabular-nums",
                  isPeak ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {shows ? point.label : "\u00a0"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
