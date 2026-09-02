"use client";

import { useCallback, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArtificialIntelligence08Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ProviderLogo } from "@/components/provider-logo";
import { useI18n } from "@/lib/i18n/provider";
import type { ModelsResponse } from "./model-picker";
import { ProviderStatusBadge, useModelCatalog } from "./model-picker";

// Settings card: is the configured key actually usable, and what does the app
// run on when nobody picks a model.
//
// "Valid" and "usable" are different questions — a key can authenticate and
// still fail every call because the account has no credit — so the check
// button asks the second one too, which costs a token and says so.

const TASK_ORDER = ["chat", "automation", "agent_design", "quick"] as const;

export function ModelHealthCard() {
  const { t } = useI18n();
  const { data, loading, reload } = useModelCatalog();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<ModelsResponse | null>(null);

  const report = checked ?? data;

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The billing probe is the whole point of pressing the button.
        body: JSON.stringify({ probe: true }),
      });
      if (res.ok) setChecked((await res.json()) as ModelsResponse);
    } catch {
      // Leave the last good report on screen rather than blanking the card.
    } finally {
      setChecking(false);
      void reload();
    }
  }, [reload]);

  return (
    <div className="mb-4 break-inside-avoid rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={ArtificialIntelligence08Icon} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{t("models.taskTitle")}</h3>
            {report ? (
              // The same pill the chat header and the agents page show, so one
              // provider state never looks like two different things.
              <ProviderStatusBadge data={report} showBalance={false} />
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("models.taskDescription")}</p>
        </div>
      </div>

      <div className="mx-5 h-px bg-border" />

      <div className="space-y-4 px-5 py-4">
        {loading && !report ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : (
          <ul className="space-y-2">
            {TASK_ORDER.map((task) => {
              const model = report?.tasks?.[task];
              return (
                <li key={task} className="flex items-center justify-between gap-3 text-xs">
                  <span className="shrink-0 text-muted-foreground">{t(`models.task.${task}`)}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {model ? <ProviderLogo vendor={model} size={13} /> : null}
                    <span className="truncate font-mono text-[11px]">{model ?? "—"}</span>
                  </span>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 text-xs">
              <span className="shrink-0 text-muted-foreground">Voz</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <ProviderLogo vendor="elevenlabs" size={13} />
                <span className="truncate font-mono text-[11px]">elevenlabs</span>
              </span>
            </li>
          </ul>
        )}

        {report?.balanceUsd !== undefined ? (
          <p className="text-xs text-muted-foreground">
            {t("models.balance", { amount: report.balanceUsd.toFixed(2) })}
          </p>
        ) : null}

        {report?.detail ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">{report.detail}</p>
        ) : null}

        <div>
          <Button size="sm" variant="outline" onClick={() => void runCheck()} disabled={checking}>
            {checking ? (
              <HugeiconsIcon icon={Loading03Icon} size={15} strokeWidth={2} className="animate-spin" />
            ) : null}
            {t("models.checkAction")}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{t("models.checkHint")}</p>
          {checked?.billingChecked ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("models.checkedAt", { time: new Date(checked.checkedAt).toLocaleTimeString() })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
