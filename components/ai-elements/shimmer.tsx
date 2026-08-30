"use client";

import { cn } from "@/lib/utils";
import { memo } from "react";

export interface TextShimmerProps {
  children: string;
  as?: "p" | "span" | "div";
  className?: string;
  /** Kept for API compat with the old Motion-based Shimmer; unused. */
  duration?: number;
  /** Kept for API compat; unused. */
  spread?: number;
}

/**
 * Pure-CSS shimmer (transitions.dev `.t-shimmer`).
 * No JS, no Motion — the gradient sweep is driven entirely by
 * the `t-shimmer` keyframes in globals.css. Colors follow light /
 * dark mode via `--shimmer-base` / `--shimmer-highlight`.
 */
const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
}: TextShimmerProps) => (
  <Component
    className={cn("t-shimmer", className)}
    data-text={children}
  >
    {children}
  </Component>
);

export const Shimmer = memo(ShimmerComponent);
