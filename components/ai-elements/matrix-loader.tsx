"use client";

import { cn } from "@/lib/utils";
import { useMemo, type CSSProperties } from "react";

export interface MatrixLoaderProps {
  variant?: "scan" | "twinkle" | "orbit" | "pulse";
  className?: string;
}

/** Delay tables from transitions.dev docs (in fractions of cycle). */
const DELAYS: Record<NonNullable<MatrixLoaderProps["variant"]>, number[]> = {
  // col * cycle/10
  scan: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3].map((c) =>
    Math.round((c * 1200) / 10),
  ),
  // [7,2,11,5,14,9,0,12,3,15,6,10,13,1,8,4] * cycle/16
  twinkle: [7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4].map((d) =>
    Math.round((d * 1200) / 16),
  ),
  // ring [1,2,7,11,14,13,8,4] * cycle/8, centre holds
  orbit: (() => {
    const ring = [1, 2, 7, 11, 14, 13, 8, 4];
    const ringDelays = ring.map((d) => Math.round((d * 1200) / 8));
    const grid: number[] = new Array(16).fill(0);
    // Ring positions: 1,2,7,11,14,13,8,4 in a 4×4 grid
    const ringPos = [1, 2, 7, 11, 14, 13, 8, 4];
    ringPos.forEach((pos, idx) => {
      grid[pos] = ringDelays[idx];
    });
    return grid;
  })(),
  // inner [5,6,9,10] first, rest cycle*0.16 behind
  pulse: (() => {
    const grid: number[] = new Array(16).fill(Math.round(1200 * 0.16));
    [5, 6, 9, 10].forEach((pos) => {
      grid[pos] = 0;
    });
    return grid;
  })(),
};

/** Corners that render nothing for rounded variants. */
const GAPS = new Set([0, 3, 12, 15]);

/**
 * transitions.dev "Matrix dot loader" (.t-matrix).
 *
 * 16 dots in a 4×4 grid, each on a shared colour-pulse cycle with a
 * per-dot delay determined by the variant. Pure CSS animation — JS
 * only assigns the `--d` delay and optional `.is-gap` class.
 *
 * Requires the `.t-matrix*` CSS from globals.css.
 */
export function MatrixLoader({
  variant = "scan",
  className,
}: MatrixLoaderProps) {
  const delays = DELAYS[variant];
  const rounded = variant === "pulse";

  const dots = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        key: i,
        delay: delays[i] ?? 0,
        gap: rounded && GAPS.has(i),
      })),
    [delays, rounded],
  );

  return (
    <div className={cn("t-matrix", className)} aria-hidden="true">
      {dots.map((dot) => (
        <i
          className={cn(dot.gap && "is-gap")}
          key={dot.key}
          style={{ "--d": dot.delay } as CSSProperties}
        />
      ))}
    </div>
  );
}
