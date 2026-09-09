// Building and reading a cron expression for people who do not know what one
// is.
//
// The Automations dialog has always shown a raw text box with the hint
// "Formato cron: minuto hora día mes díaSemana". That asks a business owner to
// learn a 1970s syntax to say "todos los lunes a las 9", and it hides the one
// thing they most need to know:
//
//   **The stored cron is evaluated in UTC.** `cronMatches` in
//   lib/automation-engine.ts reads `getUTCHours()`/`getUTCDay()`, so `0 9 * * *`
//   fires at 09:00 UTC — 06:00 in Buenos Aires, 03:00 in Los Angeles. Anyone
//   who typed 9 because they meant nine in the morning has been wrong by the
//   size of their offset ever since the field existed.
//
// So this module talks to the UI in **local** time and stores **UTC**, and the
// conversion goes through a real Date rather than modular arithmetic, which is
// what makes the day-of-week shift fall out for free: a Monday 00:30 in
// Buenos Aires is a Monday 03:30 UTC, and a Monday 22:00 in Los Angeles is a
// Tuesday 06:00 UTC. Hand-rolling that with `%` is how weekly schedules end up
// one day off for half the world.
//
// Ported from Houston's `ui/routines` (MIT, github.com/gethouston/houston),
// whose preset/classify/next-fire shape this follows. The UTC conversion and
// everything about Senka's own runner is new here: Houston stores a timezone
// per routine, and Senka has one clock, UTC, and no field to put another in.

/** The shapes the picker offers. `custom` means "a cron the presets cannot
 *  express", and it keeps the raw box for the person who does know. */
export type SchedulePreset =
  | "every_30min"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export type ScheduleOptions = {
  /** "HH:MM" in the *viewer's* local time. */
  readonly time: string;
  /** 0 (Sunday) – 6, local. One or more, for the weekly preset. */
  readonly daysOfWeek: readonly number[];
  /** 1–31, local, for the monthly preset. */
  readonly dayOfMonth: number;
};

export const DEFAULT_OPTIONS: ScheduleOptions = {
  time: "09:00",
  daysOfWeek: [1],
  dayOfMonth: 1,
};

const FIELDS = 5;

/**
 * Parse "HH:MM".
 *
 * Two different failures, deliberately handled differently. A blank string is
 * "no time was chosen" and becomes the 09:00 default — reading it as midnight
 * would silently schedule a cleared field for 00:00. A malformed *part*
 * ("12:99", "12") keeps whatever half parsed and zeroes the rest, because the
 * one thing that must never happen is a NaN reaching a cron field: that
 * produces a schedule which never fires and reports no error.
 */
export function parseTime(time: string): { hour: number; minute: number } {
  if (!time.trim()) return { hour: 9, minute: 0 };
  const [h, m] = time.split(":").map(Number);
  return {
    hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : 9,
    minute: Number.isInteger(m) && m >= 0 && m <= 59 ? m : 0,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A Date on a known Sunday-based week, at a local weekday and local time.
 *
 * 2024-01-07 was a Sunday, so `+dayOfWeek` walks that week. Constructing with
 * the local `Date(y, m, d, h, min)` constructor and then reading the `getUTC*`
 * accessors is the whole conversion: the runtime applies the viewer's own
 * offset, including whether that date was in daylight saving.
 */
function localReference(dayOfWeek: number, hour: number, minute: number): Date {
  return new Date(2024, 0, 7 + dayOfWeek, hour, minute);
}

/** Local wall-clock time → the UTC hour and minute it lands on. */
function toUtcTime(time: string): { hour: number; minute: number } {
  const { hour, minute } = parseTime(time);
  const reference = localReference(0, hour, minute);
  return { hour: reference.getUTCHours(), minute: reference.getUTCMinutes() };
}

/** UTC hour and minute → the local "HH:MM" they land on. */
function toLocalTime(hour: number, minute: number): string {
  const reference = new Date(Date.UTC(2024, 0, 7, hour, minute));
  return `${pad(reference.getHours())}:${pad(reference.getMinutes())}`;
}

/** Local weekday + local time → the UTC weekday it lands on. */
function toUtcDay(dayOfWeek: number, time: string): number {
  const { hour, minute } = parseTime(time);
  return localReference(dayOfWeek, hour, minute).getUTCDay();
}

/** UTC weekday + UTC time → the local weekday it lands on. */
function toLocalDay(dayOfWeek: number, hour: number, minute: number): number {
  return new Date(Date.UTC(2024, 0, 7 + dayOfWeek, hour, minute)).getDay();
}

/**
 * How many days the local wall-clock time is shifted from its UTC one: -1, 0
 * or +1. Used for the monthly preset, where there is no week to walk.
 */
function dayShift(time: string): number {
  const { hour, minute } = parseTime(time);
  const reference = localReference(3, hour, minute); // A Wednesday: never wraps the month.
  return reference.getUTCDate() - (7 + 3);
}

/** Build the stored (UTC) cron from a preset and local-time options. */
export function presetToCron(preset: SchedulePreset, options: ScheduleOptions): string {
  const { hour, minute } = toUtcTime(options.time);
  switch (preset) {
    case "every_30min":
      return "*/30 * * * *";
    case "hourly":
      // The minute is still meaningful hourly, and it does not move with the
      // offset for any whole-hour zone — but half-hour zones (India, Nepal)
      // shift it, so it comes from the converted value like everything else.
      return `${minute} * * * *`;
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly": {
      const days = [...new Set(options.daysOfWeek.map((day) => toUtcDay(day, options.time)))].sort(
        (a, b) => a - b,
      );
      return `${minute} ${hour} * * ${days.join(",") || "1"}`;
    }
    case "monthly": {
      // A local 1st that lands on the previous day in UTC would be the 31st,
      // the 30th or the 28th depending on the month, and cron cannot say
      // "whatever the last day is". Clamping to 1 keeps it in the month it was
      // meant for; the summary says which day it really runs.
      const shifted = options.dayOfMonth + dayShift(options.time);
      const day = Math.min(31, Math.max(1, shifted));
      return `${minute} ${hour} ${day} * *`;
    }
    case "custom":
      return "";
  }
}

/**
 * Classify a stored cron.
 *
 *   a preset slug → show that preset's controls
 *   "custom"      → a valid cron the presets cannot express; show the raw box
 *                   seeded with it
 *   null          → no schedule at all
 *
 * The three-way result is the load-bearing part. Collapsing "unrecognised"
 * into "empty" makes the builder silently fall back to Daily and overwrite a
 * schedule the owner deliberately wrote by hand.
 */
export function cronToPreset(cron: string): SchedulePreset | null {
  const trimmed = cron.trim();
  if (!trimmed) return null;
  if (trimmed === "*/30 * * * *") return "every_30min";
  if (/^\d+ \* \* \* \*$/.test(trimmed)) return "hourly";
  if (/^\d+ \d+ \* \* \*$/.test(trimmed)) return "daily";
  if (/^\d+ \d+ \* \* [0-6](,[0-6])*$/.test(trimmed)) return "weekly";
  if (/^\d+ \d+ \d+ \* \*$/.test(trimmed)) return "monthly";
  return "custom";
}

/** Read a stored (UTC) cron back into local-time options for the picker. */
export function cronToOptions(cron: string): ScheduleOptions {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== FIELDS) return DEFAULT_OPTIONS;
  const [rawMinute, rawHour, rawDom, , rawDow] = parts;

  const minute = Number(rawMinute);
  const hour = Number(rawHour);
  const hasTime = Number.isInteger(minute) && Number.isInteger(hour);
  const time = hasTime ? toLocalTime(hour, minute) : DEFAULT_OPTIONS.time;

  const daysOfWeek = /^[0-6](,[0-6])*$/.test(rawDow)
    ? [
        ...new Set(
          rawDow
            .split(",")
            .map(Number)
            .map((day) => (hasTime ? toLocalDay(day, hour, minute) : day)),
        ),
      ].sort((a, b) => a - b)
    : DEFAULT_OPTIONS.daysOfWeek;

  const storedDom = Number(rawDom);
  const dayOfMonth =
    Number.isInteger(storedDom) && storedDom >= 1 && storedDom <= 31
      ? Math.min(31, Math.max(1, storedDom - dayShift(time)))
      : DEFAULT_OPTIONS.dayOfMonth;

  return { time, daysOfWeek, dayOfMonth };
}

/** Localized weekday names, index 0 (Sunday) – 6. */
export function weekdayNames(locale: string, weekday: "short" | "long" | "narrow"): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday, timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2024, 0, 7 + index))),
  );
}

/** The viewer's own IANA zone name, for saying which clock the summary is in. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Whether the stored cron and the viewer's clock disagree — true whenever the
 * viewer is not on UTC. The dialog says so out loud, because a fixed UTC cron
 * does not follow a daylight-saving change: a schedule set for 9am local runs
 * an hour off for half the year in any zone that observes one.
 */
export function offsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}
