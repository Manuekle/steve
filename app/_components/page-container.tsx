"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared page container used by all pages inside AppShell.
 * Provides consistent max-width, padding, pattern background,
 * scroll behavior, and an entrance animation on mount.
 *
 * The `maxWidth` prop lets pages opt into a narrower container
 * (e.g. settings uses "max-w-xl") while keeping padding and
 * animation identical across the app.
 */
export function PageContainer({
  children,
  className,
  maxWidth = "max-w-5xl",
  pattern = "grid",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly maxWidth?: string;
  readonly pattern?: "grid" | "crosses" | "diagonals" | "brackets" | "none";
}) {
  const patternClass =
    pattern === "none"
      ? ""
      : `bg-pattern bg-pattern-${pattern} bg-pattern-fade`;

  return (
    <div className="flex flex-col overflow-y-auto">
      {pattern !== "none" ? (
        <div
          className={cn("pointer-events-none fixed inset-0 opacity-30", patternClass)}
        />
      ) : null}
      <div
        className={cn(
          "page-enter relative mx-auto w-full px-5 py-8 sm:px-6 sm:py-10",
          maxWidth,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
