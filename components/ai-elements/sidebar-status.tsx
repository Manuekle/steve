"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { CheckIcon, CancelCircleIcon } from "@hugeicons/core-free-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHealth, type HealthStatus } from "@/lib/use-health";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const DOT: Record<HealthStatus, string> = {
  ok: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

const LABEL: Record<HealthStatus, string> = {
  ok: "status.ok",
  degraded: "status.degraded",
  down: "status.down",
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * The line at the foot of the sidebar. It used to be a static "Self-hosted ·
 * Sandbox" label with a decorative dot; now the dot is the instance's actual
 * health and the tooltip says which check failed.
 */
export function SidebarStatus({ collapsed }: { readonly collapsed?: boolean }) {
  const t = useT();
  const { health, reachable } = useHealth();

  // No answer from the server is itself the answer, and it outranks the last
  // good payload we happen to be holding.
  const status: HealthStatus = !reachable ? "down" : (health?.status ?? "degraded");
  // First paint, before the first response: amber here would read as a fault
  // on every page load. Grey says "asking", which is the truth.
  const pending = reachable && !health;
  const environment = health?.environment ?? "sandbox";
  const environmentLabel = environment.charAt(0).toUpperCase() + environment.slice(1);

  const tip = (
    <div className="space-y-1.5">
      <p className="font-medium">{pending ? t("status.title") : t(LABEL[status])}</p>
      {reachable && health ? (
        <>
          <Check ok={health.checks.store} label={t("status.checkStore")} />
          <Check ok={health.checks.ai} label={t("status.checkAi")} />
          <Check
            ok={health.checks.channels.connected > 0}
            label={`${t("status.checkChannels")}: ${health.checks.channels.connected}/${health.checks.channels.total}`}
          />
          <p className="pt-0.5 text-muted-foreground">
            {t("status.environment")}: {environmentLabel} · {t("status.uptime")}{" "}
            {formatUptime(health.uptimeSeconds)}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">{t("status.unreachable")}</p>
      )}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center text-xs text-muted-foreground",
            collapsed ? "justify-center py-1.5" : "mt-1 gap-2.5 rounded-lg px-3 py-2.5",
          )}
          role="status"
          aria-label={`${t("status.title")}: ${pending ? "—" : t(LABEL[status])}`}
        >
          <span className="relative flex size-1.5 shrink-0">
            {/* The halo only makes sense while things are actually running. */}
            {status === "ok" && !pending ? (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex size-1.5 rounded-full",
                pending ? "bg-muted-foreground/40" : DOT[status],
              )}
            />
          </span>
          {collapsed ? null : t("nav.selfhosted", { environment: environmentLabel })}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[240px]">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function Check({ ok, label }: { readonly ok: boolean; readonly label: string }) {
  return (
    <p className="flex items-center gap-1.5">
      <HugeiconsIcon
        icon={ok ? CheckIcon : CancelCircleIcon}
        size={12}
        strokeWidth={2}
        className={ok ? "text-emerald-500" : "text-amber-500"}
      />
      {label}
    </p>
  );
}
