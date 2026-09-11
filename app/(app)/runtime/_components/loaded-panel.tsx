"use client";

import { useMemo } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { Card } from "../../../_components/dashboard-card";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { disabledTools, namesOf, SLOT_KEYS, type EveInfoResult } from "@/lib/eve-info";
import { useT } from "@/lib/i18n/provider";

// What the runtime actually loaded, as opposed to what the repository says.
//
// The difference matters more than it sounds. Tools can be disabled
// (agent/tools/web_search.ts), skills resolve per session
// (agent/skills/user-skills.ts), MCP servers are lowered from a store, and
// subagents appear because a directory exists. The only honest answer to
// "does this agent have the calendar tool" comes from the process, and
// `GET /eve/v1/info` is where the process says so.

type Slot = {
  readonly id: string;
  readonly label: string;
  readonly names: readonly string[];
  /** Names shown struck through — present in the repo, switched off in the
   *  runtime. Only tools have these today. */
  readonly off?: readonly string[];
  readonly hint?: string;
};

function SlotCard({ slot }: { readonly slot: Slot }) {
  const t = useT();
  const total = slot.names.length;
  return (
    <Card className="space-y-2.5 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{slot.label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{total}</span>
      </div>
      {total === 0 && !slot.off?.length ? (
        <p className="text-xs text-muted-foreground">{slot.hint ?? t("runtime.slotEmpty")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {slot.names.map((name) => (
            <span
              key={name}
              className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {name}
            </span>
          ))}
          {slot.off?.map((name) => (
            <span
              key={`off-${name}`}
              title={t("runtime.toolDisabled")}
              className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground line-through"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export function LoadedPanel({
  result,
  isLoading,
}: {
  readonly result: EveInfoResult | null;
  readonly isLoading: boolean;
}) {
  const t = useT();
  const slots = useMemo<Slot[]>(() => {
    if (!result?.ok) return [];
    const info = result.info;
    return [
      {
        id: "tools",
        label: t("runtime.slotTools"),
        names: namesOf(info.tools, SLOT_KEYS.tools),
        // The ones this repo turned off with `disableTool()`. Shown struck
        // through rather than omitted: "no puede navegar la web" is a decision
        // somebody made, and an absence reads like an oversight.
        off: disabledTools(info.tools),
      },
      { id: "skills", label: t("runtime.slotSkills"), names: namesOf(info.skills, SLOT_KEYS.skills) },
      {
        id: "subagents",
        label: t("runtime.slotSubagents"),
        names: namesOf(info.subagents, SLOT_KEYS.subagents),
      },
      {
        id: "connections",
        label: t("runtime.slotConnections"),
        names: namesOf(info.connections, SLOT_KEYS.connections),
        hint: t("runtime.connectionsEmpty"),
      },
      { id: "channels", label: t("runtime.slotChannels"), names: namesOf(info.channels, SLOT_KEYS.channels) },
      {
        id: "schedules",
        label: t("runtime.slotSchedules"),
        names: namesOf(info.schedules, SLOT_KEYS.schedules),
      },
      { id: "hooks", label: t("runtime.slotHooks"), names: namesOf(info.hooks, SLOT_KEYS.hooks) },
    ];
  }, [result, t]);

  if (isLoading && !result) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <SkeletonBar className="h-4 w-24" />
            <SkeletonBar className="h-3 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (!result) return null;

  if (!result.ok) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-[color:var(--status-pending-fg)]"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{t("runtime.infoFailed")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{result.error}</p>
          <p className="font-mono text-[11px] break-all text-muted-foreground">{result.url}</p>
        </div>
      </Card>
    );
  }

  // `agent.model` is an object on a current runtime (`{ id, routing, … }`) and
  // was a bare string on older ones; both shapes still turn up depending on
  // which eve a deploy is pinned to.
  const agentModel = (result.info.agent as { model?: unknown })?.model;
  const model =
    typeof agentModel === "string"
      ? agentModel
      : ((agentModel as { id?: string })?.id ??
        (typeof result.info.model === "string" ? result.info.model : undefined) ??
        "—");
  const routing = (agentModel as { routing?: { provider?: string } })?.routing?.provider;

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("runtime.model")}</p>
          <p className="font-mono text-sm text-foreground">
            {String(model)}
            {routing ? (
              <span className="ml-2 font-sans text-xs text-muted-foreground">
                {t("runtime.via", { provider: routing })}
              </span>
            ) : null}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("runtime.endpoint")}</p>
          <p className="font-mono text-sm break-all text-foreground">{result.url}</p>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <SlotCard key={slot.id} slot={slot} />
        ))}
      </div>
    </div>
  );
}
