"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowDown01Icon,
  CheckIcon,
  AlertCircleIcon,
  ArtificialIntelligence08Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ProviderLogo } from "@/components/provider-logo";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { useI18n } from "@/lib/i18n/provider";
import { useCredentialsChanged } from "@/lib/credentials-changed";
import type { AiProvider } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

// The model chooser used by the chat header and the agents form.
//
// The list is whatever the configured provider actually serves — 200-plus
// entries through the Gateway — so it is a searchable command list rather
// than a dropdown, with the models we vouch for pinned to the top and the
// real per-million price on every row. Price is the number that decides most
// of these choices, and hiding it behind a docs link helps nobody.

export type PickerModel = {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  readonly inputPerMillion?: number;
  readonly outputPerMillion?: number;
  readonly contextWindow?: number;
  readonly tier: "economy" | "balanced" | "premium";
  readonly recommended: boolean;
  /** Set when the account authenticates but is not allowed to call this
   *  model — the provider's own words, so the fix is obvious. */
  readonly restrictedReason?: string;
};

export type ModelsResponse = {
  readonly provider: AiProvider;
  readonly status:
    | "ok"
    | "missing"
    | "invalid"
    | "no_credit"
    | "rate_limited"
    | "unreachable"
    | "free_tier";
  readonly detail?: string;
  readonly balanceUsd?: number;
  readonly billingChecked: boolean;
  readonly checkedAt: string;
  readonly models: readonly PickerModel[];
  readonly tasks: Record<string, string>;
};

/** Shared fetch so the chat header and the agents page agree on the catalog
 *  and hit the (server-cached) endpoint once per mount. */
export function useModelCatalog(provider?: string) {
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      // Settings needs the catalog for the provider the user just selected,
      // which is not yet the saved one.
      const url = provider ? `/api/models?provider=${encodeURIComponent(provider)}` : "/api/models";
      const res = await fetch(url);
      if (!res.ok) throw new Error("failed");
      setData((await res.json()) as ModelsResponse);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A key saved in Settings or in the Connections dialog changes which models
  // this can list — and it is never this component that saved it. Refetch on
  // the broadcast instead of leaving a stale catalog until the next mount.
  useCredentialsChanged(reload);

  return { data, loading, reload };
}

export function formatPerMillion(value: number | undefined): string | null {
  if (value === undefined) return null;
  // Sub-cent prices need the extra digits to stay distinguishable.
  return value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(2)}`;
}

function ModelRow({ model, active }: { readonly model: PickerModel; readonly active: boolean }) {
  const { t } = useI18n();
  const input = formatPerMillion(model.inputPerMillion);
  const output = formatPerMillion(model.outputPerMillion);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <ProviderLogo vendor={model.vendor} size={16} className="text-foreground" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-sm", model.restrictedReason && "text-muted-foreground line-through")}>
            {model.id}
          </span>
          {model.restrictedReason ? (
            <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {t("models.restricted")}
            </span>
          ) : model.recommended ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t("models.recommended")}
            </span>
          ) : null}
        </span>
        {model.restrictedReason ? (
          <span className="mt-0.5 block truncate text-[11px] text-amber-600 dark:text-amber-400">
            {model.restrictedReason}
          </span>
        ) : input && output ? (
          <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground">
            {t("models.pricePerMillion", { input, output })}
            {model.contextWindow
              ? ` · ${t("models.context", { tokens: Math.round(model.contextWindow / 1000) })}`
              : ""}
          </span>
        ) : null}
      </span>
      {active ? (
        <HugeiconsIcon
          icon={CheckIcon}
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-emerald-600 dark:text-emerald-400"
        />
      ) : null}
    </div>
  );
}

export function ModelPicker({
  models,
  value,
  onChange,
  autoLabel,
  disabled,
  loading,
  className,
  size = "sm",
}: {
  readonly models: readonly PickerModel[];
  /** `null` means "let the app choose per task". */
  readonly value: string | null;
  readonly onChange: (model: string | null) => void;
  /** What the automatic choice resolves to, shown when `value` is null. */
  readonly autoLabel?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly className?: string;
  readonly size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => models.find((model) => model.id === value) ?? null,
    [models, value],
  );

  const { recommended, rest } = useMemo(() => {
    const usable = models.filter((model) => !model.restrictedReason);
    const blocked = models.filter((model) => model.restrictedReason);
    return {
      recommended: usable.filter((model) => model.recommended),
      rest: [...usable.filter((model) => !model.recommended), ...blocked],
    };
  }, [models]);

  const choose = (next: string | null) => {
    if (next && models.find((model) => model.id === next)?.restrictedReason) return;
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex max-w-[15rem] items-center gap-2 rounded-lg border border-border bg-card font-medium shadow-[var(--shadow-inset)] transition-colors hover:border-input hover:bg-accent disabled:opacity-60",
          size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
          className,
        )}
        title={t("models.pick")}
      >
        {loading ? (
          <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={2} className="animate-spin" />
        ) : selected ? (
          <ProviderLogo vendor={selected.vendor} size={14} />
        ) : (
          <HugeiconsIcon icon={ArtificialIntelligence08Icon} size={14} strokeWidth={1.75} />
        )}
        <span className="truncate">
          {selected ? selected.id : autoLabel ? t("models.autoWith", { model: autoLabel }) : t("models.auto")}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
        />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("models.pick")}
        description={t("models.pickDescription")}
      >
        <CommandInput placeholder={t("models.searchPlaceholder")} />
        <CommandList>
          <CommandEmpty>{t("models.noneFound")}</CommandEmpty>

          <CommandGroup heading={t("models.automatic")}>
            <CommandItem value="auto automatic recomendado" onSelect={() => choose(null)}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <HugeiconsIcon icon={ArtificialIntelligence08Icon} size={16} strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t("models.auto")}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {t("models.autoHint")}
                  </span>
                </span>
                {value === null ? (
                  <HugeiconsIcon
                    icon={CheckIcon}
                    size={16}
                    strokeWidth={1.75}
                    className="shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                ) : null}
              </div>
            </CommandItem>
          </CommandGroup>

          {recommended.length > 0 ? (
            <CommandGroup heading={t("models.recommendedGroup")}>
              {recommended.map((model) => (
                <CommandItem key={model.id} value={model.id} onSelect={() => choose(model.id)}>
                  <ModelRow model={model} active={model.id === value} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {rest.length > 0 ? (
            <CommandGroup heading={t("models.allGroup", { count: rest.length })}>
              {rest.map((model) => (
                <CommandItem key={model.id} value={model.id} onSelect={() => choose(model.id)}>
                  <ModelRow model={model} active={model.id === value} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}

/** Every provider state, in the badge vocabulary the rest of the app uses:
 *  green for working, amber for working-but-limited, grey for not set up,
 *  red for broken. */
const PROVIDER_STATUS_VARIANT: Record<ModelsResponse["status"], StatusVariant> = {
  ok: "connected",
  // Usable, with a catch worth reading — the amber cases.
  free_tier: "warning",
  no_credit: "warning",
  rate_limited: "warning",
  // Nothing configured yet is a neutral state, not a failure.
  missing: "disconnected",
  invalid: "error",
  unreachable: "error",
};

/** The small badge that says whether the provider key is usable right now.
 *  Same pill as every other status in the app — it used to be a hand-rolled
 *  outlined span, which read as a different component entirely. */
export function ProviderStatusBadge({
  data,
  showBalance = true,
}: {
  readonly data: ModelsResponse | null;
  /** Off where the balance already has its own line, so it isn't said twice. */
  readonly showBalance?: boolean;
}) {
  const { t } = useI18n();
  if (!data) return null;

  const label =
    t(`models.status.${data.status}`) +
    (showBalance && data.balanceUsd !== undefined
      ? ` · ${t("models.balance", { amount: data.balanceUsd.toFixed(2) })}`
      : "");

  return (
    <StatusBadge
      status={PROVIDER_STATUS_VARIANT[data.status]}
      label={label}
      title={data.detail}
    />
  );
}
