"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import {
  cronToOptions,
  cronToPreset,
  DEFAULT_OPTIONS,
  localTimeZone,
  offsetMinutes,
  presetToCron,
  type SchedulePreset,
  type ScheduleOptions,
  weekdayNames,
} from "@/lib/cron-builder";

// Saying "every Monday at 9" without knowing what a cron expression is.
//
// The field this replaces was a text box with the hint "Formato cron: minuto
// hora día mes díaSemana", which is a syntax exam standing between a business
// owner and a weekly reminder. The presets cover what people actually schedule;
// the raw box is still here under "custom" for whoever wants it, and a cron
// the presets cannot express opens straight into it rather than being
// silently rewritten.
//
// The other half of the job is honesty about the clock. Steve evaluates these
// in UTC (`cronMatches` in lib/automation-engine.ts reads getUTCHours), so the
// picker takes local time, stores UTC, and shows both — see lib/cron-builder.ts.

const PRESETS: readonly SchedulePreset[] = [
  "every_30min",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "custom",
];

const PRESET_LABELS: Record<SchedulePreset, string> = {
  every_30min: "automations.schedEvery30",
  hourly: "automations.schedHourly",
  daily: "automations.schedDaily",
  weekly: "automations.schedWeekly",
  monthly: "automations.schedMonthly",
  custom: "automations.schedCustom",
};

/** Which controls each preset needs. */
const NEEDS_TIME: readonly SchedulePreset[] = ["hourly", "daily", "weekly", "monthly"];

export function ScheduleBuilder({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (cron: string) => void;
}) {
  const { t, locale } = useI18n();

  // Seeded from the stored cron once, then owned here.
  //
  // Deliberately not synced back from `value` on every render. The parent holds
  // the cron, so our own `onChange` changes the prop we would be syncing from,
  // and re-deriving the controls from it fights the user: a half-typed custom
  // cron gets reclassified mid-keystroke, and the monthly day clamps under the
  // cursor. Switching to a different automation re-seeds by remount instead —
  // the list page passes `key={editingAutomation?.id ?? "new"}` (see
  // app/(app)/automations/page.tsx), and the detail page only ever edits one.
  const [preset, setPreset] = useState<SchedulePreset>(() => cronToPreset(value) ?? "daily");
  const [options, setOptions] = useState<ScheduleOptions>(() =>
    value ? cronToOptions(value) : DEFAULT_OPTIONS,
  );
  const [raw, setRaw] = useState(value);

  const emit = (nextPreset: SchedulePreset, nextOptions: ScheduleOptions, nextRaw: string) => {
    onChange(nextPreset === "custom" ? nextRaw : presetToCron(nextPreset, nextOptions));
  };

  const update = (patch: Partial<ScheduleOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    emit(preset, next, raw);
  };

  const days = useMemo(() => weekdayNames(locale, "short"), [locale]);
  const offset = offsetMinutes();
  const utcTime = useMemo(() => {
    if (preset === "custom") return null;
    const cron = presetToCron(preset, options);
    const parts = cron.split(" ");
    const hour = Number(parts[1]);
    return Number.isInteger(hour)
      ? `${String(hour).padStart(2, "0")}:${String(Number(parts[0])).padStart(2, "0")}`
      : null;
  }, [preset, options]);

  return (
    <div className="space-y-3">
      <label className="block space-y-2 text-sm">
        <span className="font-medium">{t("automations.schedWhen")}</span>
        <Select
          onValueChange={(next) => {
            const chosen = next as SchedulePreset;
            setPreset(chosen);
            // Moving off custom must not carry the hand-written cron along as
            // if a preset had produced it.
            emit(chosen, options, chosen === "custom" ? raw : "");
          }}
          value={preset}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(PRESET_LABELS[option])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {preset === "weekly" ? (
        <div className="space-y-2 text-sm">
          <span className="font-medium">{t("automations.schedDays")}</span>
          <div className="flex flex-wrap gap-1.5">
            {days.map((name, index) => {
              const on = options.daysOfWeek.includes(index);
              return (
                <button
                  aria-pressed={on}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs capitalize transition-colors",
                    on
                      ? "border-foreground/20 bg-foreground/5 text-foreground"
                      : "border-border bg-card/50 text-muted-foreground hover:text-foreground",
                  )}
                  key={name}
                  onClick={() => {
                    const next = on
                      ? options.daysOfWeek.filter((day) => day !== index)
                      : [...options.daysOfWeek, index];
                    // A weekly schedule with no day selected is a cron that
                    // never fires, so the last one cannot be turned off.
                    if (next.length > 0) update({ daysOfWeek: next });
                  }}
                  type="button"
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {preset === "monthly" ? (
        <label className="block space-y-2 text-sm">
          <span className="font-medium">{t("automations.schedDayOfMonth")}</span>
          <Input
            max={31}
            min={1}
            onChange={(event) => {
              const day = Number(event.target.value);
              if (Number.isInteger(day) && day >= 1 && day <= 31) update({ dayOfMonth: day });
            }}
            type="number"
            value={options.dayOfMonth}
          />
          <p className="text-xs text-muted-foreground">{t("automations.schedDayOfMonthHint")}</p>
        </label>
      ) : null}

      {NEEDS_TIME.includes(preset) ? (
        <label className="block space-y-2 text-sm">
          <span className="font-medium">
            {preset === "hourly" ? t("automations.schedMinute") : t("automations.schedTime")}
          </span>
          <Input
            onChange={(event) => update({ time: event.target.value })}
            type="time"
            value={options.time}
          />
        </label>
      ) : null}

      {preset === "custom" ? (
        <label className="block space-y-2 text-sm">
          <span className="font-medium">{t("automations.cronExpression")}</span>
          <Input
            onChange={(event) => {
              setRaw(event.target.value);
              onChange(event.target.value);
            }}
            placeholder="*/5 * * * *"
            value={raw}
          />
          <p className="text-xs text-muted-foreground">{t("automations.cronFormat")}</p>
        </label>
      ) : null}

      {/* The part the old field never said. A fixed UTC cron does not follow a
          daylight-saving change, so a schedule set for 9am local runs an hour
          off for half the year in any zone that observes one. */}
      {offset !== 0 && utcTime && preset !== "every_30min" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("automations.schedUtcNote", { time: utcTime, zone: localTimeZone() })}
        </p>
      ) : null}
    </div>
  );
}
