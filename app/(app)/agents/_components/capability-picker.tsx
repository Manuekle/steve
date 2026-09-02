"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import { CheckIcon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

// What this agent is allowed to reach for.
//
// A checklist rather than a comma-separated text box, because the old box
// asked people to type tool names they had no way to know and then did
// nothing with what they typed. Each row says what the capability is for, and
// a capability whose integration is missing says so and links to where it is
// configured — the picker is where someone finds out that "Cobrar" needs a
// Stripe key, not the transcript where the agent failed to send a link.

export type CapabilityOption = {
  readonly id: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly sensitive: boolean;
  readonly configured: boolean;
};

export function CapabilityPicker({
  options,
  value,
  onChange,
  compact = false,
}: {
  readonly options: readonly CapabilityOption[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  /** The inline editor is narrower than the create form. */
  readonly compact?: boolean;
}) {
  const t = useT();
  const selected = new Set(value);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  if (options.length === 0) {
    return <p className="text-muted-foreground text-xs">{t("agents.capabilitiesLoading")}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn("grid gap-1.5", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {options.map((option) => {
          const on = selected.has(option.id);
          return (
            <button
              aria-pressed={on}
              className={cn(
                "border-border flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                on ? "border-primary/40 bg-primary/5" : "hover:bg-accent/40",
              )}
              key={option.id}
              onClick={() => toggle(option.id)}
              type="button"
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {on ? <HugeiconsIcon icon={CheckIcon} size={11} strokeWidth={2.5} /> : null}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium">{t(option.labelKey)}</span>
                  {option.sensitive ? (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-500">
                      {t("agents.capabilitySensitive")}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-[11px] leading-snug">
                  {t(option.descriptionKey)}
                </span>
                {/* Only worth saying once it is ticked: an unticked capability
                    nobody wants does not need a warning about a key nobody
                    was going to add. */}
                {on && !option.configured ? (
                  <Link
                    className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600 hover:underline dark:text-amber-500"
                    href="/settings"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <HugeiconsIcon icon={AlertCircleIcon} size={11} strokeWidth={2} />
                    {t("agents.capabilityNotConfigured")}
                  </Link>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-[11px]">
        {selected.size === 0 ? t("agents.capabilitiesNoneHelp") : t("agents.capabilitiesHelp")}
      </p>
    </div>
  );
}
