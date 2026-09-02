"use client";

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { CHART_TONE_FILL, CHART_TONE_STROKE, type ChartTone } from "./chart";
import { Card } from "./dashboard-card";
import { cn } from "@/lib/utils";

/**
 * The number tile used across the dashboard, automations, reminders, knowledge,
 * setup and ads.
 *
 * It used to be a brushed-metal plate with a 52px icon stamped into the corner
 * at 24% opacity. The icon was the largest thing on the tile and the only one
 * carrying no information — every card in a row had a different glyph doing
 * the same job the label underneath it already did, and at that size it
 * competed with the number for the eye. It is now 14px, on the label's line,
 * where an icon marks a category instead of decorating a card.
 *
 * The band between the number and the label is the tile's own: `visual` takes
 * whatever that particular metric is best shown as — a fill meter for a budget,
 * a sparkline for a latency series, a split bar for a set of statuses. Four
 * tiles in a row are four different pictures rather than the same card printed
 * four times.
 */

/* One set of colour roles for every mark in the product — a tile's meter and a
   card's chart have to mean the same thing by "warning". They live with the
   charts because that is where the roles are documented. */
type Tone = ChartTone;

const TONE_FILL = CHART_TONE_FILL;
const TONE_STROKE = CHART_TONE_STROKE;

// ── Delta ───────────────────────────────────────────────────────────

export type KpiDelta = {
  readonly direction: "down" | "flat" | "up";
  /** What the change is in — "Prompts", "vs. la semana pasada". */
  readonly label?: string;
  /**
   * Colour, when the direction is not the whole story. A latency that fell is
   * a direction of `down` and a tone of `positive`; leave it out and the tile
   * colours by direction, which is right for most counts.
   */
  readonly tone?: Tone;
  /** Pre-formatted, sign included: `+8.4%`. */
  readonly value: string;
};

const DIRECTION_ICON = {
  down: ArrowDownRight01Icon,
  flat: MinusSignIcon,
  up: ArrowUpRight01Icon,
} as const;

const DIRECTION_TONE: Readonly<Record<KpiDelta["direction"], Tone>> = {
  down: "critical",
  flat: "neutral",
  up: "positive",
};

function DeltaLine({ delta }: { readonly delta: KpiDelta }) {
  const tone = delta.tone ?? DIRECTION_TONE[delta.direction];
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs">
      <HugeiconsIcon
        className={cn("shrink-0", TONE_STROKE[tone])}
        icon={DIRECTION_ICON[delta.direction]}
        size={13}
        strokeWidth={2}
      />
      <span className={cn("font-medium tabular-nums", TONE_STROKE[tone])}>{delta.value}</span>
      {delta.label ? <span className="truncate text-muted-foreground">{delta.label}</span> : null}
    </p>
  );
}

// ── Visuals ─────────────────────────────────────────────────────────

/**
 * A fill meter drawn as discrete ticks.
 *
 * A solid progress bar reads as "loading"; a row of ticks reads as a gauge,
 * and it is legible at a glance at a fraction of a bar's visual weight.
 */
export function KpiBars({
  ratio,
  segments = 24,
  tone = "neutral",
}: {
  /** 0–1. Clamped, so a metric that overshoots its target fills and stops. */
  readonly ratio: number;
  readonly segments?: number;
  readonly tone?: Tone;
}) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * segments);
  return (
    <div aria-hidden="true" className="flex h-6 items-stretch gap-[3px]">
      {Array.from({ length: segments }, (_, i) => (
        <span
          className={cn("flex-1 rounded-full", i < filled ? TONE_FILL[tone] : "bg-muted")}
          key={i}
        />
      ))}
    </div>
  );
}

/**
 * A series, drawn as a line and nothing else — no axes, no grid, no dots. The
 * shape is the whole message; anything that would let you read a value off it
 * belongs on a chart, not on a tile.
 */
export function KpiSparkline({
  points,
  tone = "neutral",
}: {
  /** At least two values. Scaled to their own min and max. */
  readonly points: readonly number[];
  readonly tone?: Tone;
}) {
  if (points.length < 2) return <div className="h-6" />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat series has no range to divide by; park it on the centre line.
  const span = max - min || 1;
  const path = points
    .map((value, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = max === min ? 16 : 28 - ((value - min) / span) * 24;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={cn("h-6 w-full", TONE_STROKE[tone])}
      fill="none"
      preserveAspectRatio="none"
      viewBox="0 0 100 32"
    >
      <path
        d={path}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        /* The viewBox is stretched to the tile's width, which would stretch
           the stroke with it. This keeps the line one weight everywhere. */
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A set of parts as one bar.
 *
 * For the tiles whose number is a count out of a whole — active against paused
 * against draft — where the useful thing is not the count but its share.
 */
export function KpiSplit({
  parts,
}: {
  readonly parts: readonly { readonly tone: Tone; readonly value: number }[];
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  // Ranked, so the ramp below lands on the parts in the order a reader cares
  // about them. Four campaigns arrive in whatever order the API listed them.
  const ranked = [...parts].sort((a, b) => b.value - a.value);
  return (
    <div aria-hidden="true" className="flex h-6 items-center">
      <div className="flex h-2 w-full gap-[3px]">
        {total === 0 ? (
          <span className="w-full rounded-full bg-muted" />
        ) : (
          ranked.map((part, i) => (
            <span
              className={cn(
                "rounded-full",
                part.tone === "neutral" ? "bg-foreground" : TONE_FILL[part.tone],
              )}
              key={i}
              style={{
                /* Neutral parts step down in weight rather than repeating one
                   grey. Equal-weight segments separated by gaps read as a
                   dashed line — four ticks that happen to be different
                   lengths — instead of as one quantity split four ways. */
                opacity: part.tone === "neutral" ? Math.max(0.14, 0.62 - i * 0.13) : undefined,
                width: `${(part.value / total) * 100}%`,
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Tile ────────────────────────────────────────────────────────────

export function KpiCard({
  className,
  delta,
  icon,
  label,
  sub,
  value,
  visual,
}: {
  readonly className?: string;
  /** The change line under the number. Takes the slot `sub` otherwise uses. */
  readonly delta?: KpiDelta;
  readonly icon: IconSvgElement;
  readonly label: string;
  /** Context line, for tiles whose story is a sentence rather than a delta. */
  readonly sub?: string;
  /** This tile's own picture — `KpiBars`, `KpiSparkline`, `KpiSplit`, or any
   *  node. Tiles that have nothing worth drawing leave it out. */
  readonly visual?: ReactNode;
  readonly value: number | string;
}) {
  return (
    <Card className={cn("kpi-card", className)} interactive>
      <div className="relative flex h-full flex-col p-5">
        <div className="kpi-plate">
          {/* Inter, tabular, and only as heavy as it needs to be. The figure is
              already the biggest thing here; semibold on top of that was the
              number shouting over its own size. `font-sans` is explicit so a
              display face can never creep in from a heading rule. */}
          <p className="kpi-value font-sans font-medium text-[28px] leading-none tracking-[-0.02em] tabular-nums">
            {value}
          </p>

          {delta ? (
            <DeltaLine delta={delta} />
          ) : sub ? (
            <p className="mt-2 truncate text-muted-foreground text-xs">{sub}</p>
          ) : null}
        </div>

        {visual ? (
          <div className="kpi-plate mt-4">{visual}</div>
        ) : (
          /* No picture: the label still has to sit on the floor of the tile,
             or a row of mixed tiles has its labels at three different heights. */
          <div className="flex-1" />
        )}

        <div className="kpi-plate mt-4 flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon className="shrink-0" icon={icon} size={14} strokeWidth={1.75} />
          <p className="truncate font-medium text-xs">{label}</p>
        </div>
      </div>
    </Card>
  );
}
