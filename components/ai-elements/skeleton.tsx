"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps {
  /** When true, the skeleton is visible and pulsing. When false, the
   *  content is revealed with the dissolve transition. */
  isLoading: boolean;
  /** The real content — fades in when isLoading becomes false. */
  children: ReactNode;
  /** The skeleton placeholder — fades out when data arrives. */
  skeleton: ReactNode;
  className?: string;
}

/**
 * transitions.dev "Skeleton loader and reveal" (.t-skel).
 *
 * Stacks a skeleton layer and a content layer on the same coordinates.
 * While loading, the skeleton pulses (`.is-pulsing`) and the content is
 * hidden. When `isLoading` flips to false, `.is-revealed` is added so the
 * skeleton cross-fades + blurs out while the content cross-fades + un-blurs
 * in — one smooth swap with no layout shift.
 *
 * To replay the loading state (e.g. refetch), the component handles the
 * `.is-resetting` snap-back internally: it briefly removes `.is-revealed`
 * with transitions disabled, forces a reflow, then re-enables.
 */
export function Skeleton({ isLoading, children, skeleton, className }: SkeletonProps) {
  const [revealed, setRevealed] = useState(!isLoading);
  const [resetting, setResetting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(isLoading);

  useEffect(() => {
    // Transition: loading → revealed
    if (wasLoadingRef.current && !isLoading) {
      setRevealed(true);
    }

    // Transition: revealed → loading (replay)
    if (!wasLoadingRef.current && isLoading) {
      // Snap back without animating the reverse
      setResetting(true);
      setRevealed(false);
      // Force a reflow so the reset takes effect before we drop is-resetting
      if (wrapRef.current) {
        void wrapRef.current.offsetHeight;
      }
      // Next tick: drop is-resetting so the next reveal animates
      requestAnimationFrame(() => {
        setResetting(false);
      });
    }

    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  return (
    <div
      className={cn("t-skel", revealed && "is-revealed", resetting && "is-resetting", className)}
      ref={wrapRef}
    >
      {isLoading ? (
        <div className="t-skel-skeleton is-pulsing">{skeleton}</div>
      ) : (
        <div className="t-skel-skeleton" aria-hidden="true" />
      )}
      <div className="t-skel-content" aria-hidden={isLoading}>{children}</div>
    </div>
  );
}

/* ── Skeleton building blocks ──────────────────────────────────────── */

/** A single pulsing bar. Combine multiple to build skeleton layouts. */
export function SkeletonBar({
  className,
  width,
}: {
  readonly className?: string;
  readonly width?: string;
}) {
  return (
    <div
      className={cn("rounded-md bg-muted", className)}
      style={width ? { width } : undefined}
    />
  );
}

/** A circular avatar placeholder. */
export function SkeletonAvatar({
  className,
  size = "size-9",
}: {
  readonly className?: string;
  readonly size?: string;
}) {
  return <div className={cn("rounded-full bg-muted", size, className)} />;
}

/* ── Page-level skeletons ──────────────────────────────────────────── */

/** Skeleton for the Dashboard page — stats grid, chart, cards. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-44" />
          <SkeletonBar className="h-4 w-72" />
        </div>
        <SkeletonBar className="hidden h-10 w-28 sm:block" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="absolute top-1/2 right-3 size-14 -translate-y-1/2 rounded-full bg-muted/40" />
            <div className="relative space-y-2">
              <SkeletonBar className="h-3.5 w-24" />
              <SkeletonBar className="h-7 w-16" />
              <SkeletonBar className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>

      {/* Two-column grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Activity chart */}
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] lg:col-span-2">
          <div className="flex items-center gap-3 p-5">
            <SkeletonAvatar />
            <div className="space-y-2">
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="h-3 w-40" />
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="px-5 py-6">
            <div className="flex items-end justify-between gap-2" style={{ height: "120px" }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <SkeletonBar className="w-full max-w-[32px]" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Channel breakdown */}
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3 p-5">
            <SkeletonAvatar />
            <div className="space-y-2">
              <SkeletonBar className="h-4 w-24" />
              <SkeletonBar className="h-3 w-32" />
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="space-y-4 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <SkeletonBar className="h-4 w-20" />
                  <SkeletonBar className="h-4 w-12" />
                </div>
                <SkeletonBar className="h-2 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Channels + recent chats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3 p-5">
              <SkeletonAvatar />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-4 w-20" />
                <SkeletonBar className="h-3 w-32" />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="p-5">
              <SkeletonBar className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the Chats history page — search bar + list of chat rows. */
export function ChatsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <SkeletonBar className="h-7 w-44" />
        <SkeletonBar className="h-4 w-64" />
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <SkeletonBar className="h-9 w-full" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBar key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>

      {/* Chat list */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <SkeletonAvatar />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-4 w-48" />
                <SkeletonBar className="h-3 w-72" />
              </div>
              <div className="space-y-2 text-right">
                <SkeletonBar className="ml-auto h-3 w-12" />
                <SkeletonBar className="ml-auto h-3 w-8" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the Automations page — header + list of automation cards. */
export function AutomationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-52" />
          <SkeletonBar className="h-4 w-64" />
        </div>
        <SkeletonBar className="h-10 w-36" />
      </div>

      {/* Automation cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3 p-5">
              <SkeletonAvatar />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-4 w-32" />
                <SkeletonBar className="h-3 w-48" />
              </div>
              <SkeletonBar className="h-6 w-16 rounded-full" />
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-3 p-5">
              <SkeletonBar className="h-3 w-full" />
              <SkeletonBar className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the Settings page — bento grid of credential cards. */
export function SettingsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-44" />
          <SkeletonBar className="h-4 w-64" />
        </div>
        <SkeletonBar className="hidden h-10 w-24 sm:block" />
      </div>

      {/* Bento grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
            <div className="flex items-start gap-3 p-5">
              <SkeletonAvatar />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-4 w-28" />
                <SkeletonBar className="h-3 w-48" />
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-5 p-5">
              {Array.from({ length: i === 0 ? 1 : i === 1 ? 4 : 3 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <SkeletonBar className="h-4 w-32" />
                  <SkeletonBar className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Save bar */}
      <SkeletonBar className="h-10 w-36" />
    </div>
  );
}
