"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  CancelCircleIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { Card } from "../../../_components/dashboard-card";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { useT } from "@/lib/i18n/provider";
import type { StackComponent, StackReport, StackStatus } from "@/lib/agent-stack";
import { cn } from "@/lib/utils";

// The six pieces of the Agent Stack, and whether each one is actually wired.
//
// Drawn as a grid of small cards rather than a table because the useful glance
// is "is anything red", and a table makes you read six rows to find out. The
// detail line under each name is the answer to "what is true right now", and
// the fix line only appears when there is something to do — a card with no
// call to action should not pretend to have one.

const TONE: Record<
  StackStatus,
  { readonly surface: string; readonly icon: string; readonly text: string }
> = {
  ok: {
    surface: "border-border border-l-2 border-l-[color:var(--status-success-fg)] bg-card",
    icon: "bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]",
    text: "text-[color:var(--status-success-fg)]",
  },
  warn: {
    surface: "border-border border-l-2 border-l-[color:var(--status-pending-fg)] bg-card",
    icon: "bg-[var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
    text: "text-[color:var(--status-pending-fg)]",
  },
  missing: {
    surface: "border-border border-l-2 border-l-[color:var(--status-failed-fg)] bg-card",
    icon: "bg-[var(--status-failed-bg)] text-[color:var(--status-failed-fg)]",
    text: "text-[color:var(--status-failed-fg)]",
  },
};

const ICON = {
  ok: CheckmarkCircle02Icon,
  warn: AlertCircleIcon,
  missing: CancelCircleIcon,
} as const;

function StackCard({ component }: { readonly component: StackComponent }) {
  const t = useT();
  const tone = TONE[component.status];
  return (
    <Card className={cn("border p-4", tone.surface)}>
      <div className="flex items-start gap-2.5">
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", tone.icon)}>
          <HugeiconsIcon icon={ICON[component.status]} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-foreground">{component.label}</span>
            {component.version ? (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {component.version}
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(component.detail.key, component.detail.params)}
          </p>
          {component.fix ? (
            <p className={cn("text-xs leading-relaxed", tone.text)}>
              {t(component.fix.key, component.fix.params)}
            </p>
          ) : null}
          <a
            href={component.docs}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("runtime.docs")}
            <HugeiconsIcon icon={LinkSquare02Icon} size={11} strokeWidth={2} />
          </a>
        </div>
      </div>
    </Card>
  );
}

export function StackPanel({
  report,
  isLoading,
}: {
  readonly report: StackReport | null;
  readonly isLoading: boolean;
}) {
  if (isLoading && !report) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-2/3" />
          </Card>
        ))}
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {report.components.map((component) => (
        <StackCard key={component.id} component={component} />
      ))}
    </div>
  );
}
