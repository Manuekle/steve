import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cronToOptions,
  cronToPreset,
  DEFAULT_OPTIONS,
  parseTime,
  presetToCron,
  weekdayNames,
} from "./cron-builder";

/**
 * Every conversion here depends on the runtime's local zone, so each test that
 * cares pins one. `vi.stubEnv("TZ", …)` is not enough on its own — the Date
 * implementation caches the zone — so the tests that need a specific offset
 * assert on the round trip instead, which holds in any zone, and the two
 * offset-sensitive cases pin TZ and rebuild the module.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseTime", () => {
  it("reads HH:MM", () => {
    expect(parseTime("14:30")).toEqual({ hour: 14, minute: 30 });
  });

  // A cleared field is "nothing chosen", not midnight.
  it.each(["", "   "])("falls back to 09:00 for the blank %o", (value) => {
    expect(parseTime(value)).toEqual({ hour: 9, minute: 0 });
  });

  // A NaN in a cron field produces a schedule that never fires and no error,
  // so a half-parseable time keeps the half that read and zeroes the rest.
  it.each([
    ["nonsense", { hour: 9, minute: 0 }],
    ["25:00", { hour: 9, minute: 0 }],
    ["12:99", { hour: 12, minute: 0 }],
    ["12", { hour: 12, minute: 0 }],
  ])("never yields NaN for %o", (value, expected) => {
    expect(parseTime(value)).toEqual(expected);
  });
});

describe("cronToPreset", () => {
  it("returns null for no schedule at all", () => {
    expect(cronToPreset("")).toBeNull();
    expect(cronToPreset("   ")).toBeNull();
  });

  it.each([
    ["*/30 * * * *", "every_30min"],
    ["0 * * * *", "hourly"],
    ["30 * * * *", "hourly"],
    ["0 9 * * *", "daily"],
    ["0 9 * * 1", "weekly"],
    ["0 9 * * 1,3,5", "weekly"],
    ["0 9 15 * *", "monthly"],
  ])("classifies %s as %s", (cron, preset) => {
    expect(cronToPreset(cron)).toBe(preset);
  });

  // The distinction that matters: a cron the presets cannot express is not the
  // same as no cron. Collapsing them makes the builder fall back to Daily and
  // overwrite a hand-written schedule on reopen.
  it.each(["*/5 * * * *", "0 9 1 1 *", "0 0 * * 1-5", "not a cron"])(
    "calls %s custom rather than empty",
    (cron) => {
      expect(cronToPreset(cron)).toBe("custom");
    },
  );
});

describe("presetToCron", () => {
  it("ignores the time for the fixed-interval presets", () => {
    expect(presetToCron("every_30min", DEFAULT_OPTIONS)).toBe("*/30 * * * *");
  });

  it("produces five fields for every preset that has a schedule", () => {
    for (const preset of ["every_30min", "hourly", "daily", "weekly", "monthly"] as const) {
      const cron = presetToCron(preset, DEFAULT_OPTIONS);
      expect(cron.split(/\s+/)).toHaveLength(5);
      expect(cron).not.toContain("NaN");
    }
  });

  it("leaves custom empty for the caller to fill", () => {
    expect(presetToCron("custom", DEFAULT_OPTIONS)).toBe("");
  });

  it("sorts and dedupes the weekly days", () => {
    const cron = presetToCron("weekly", { ...DEFAULT_OPTIONS, time: "12:00", daysOfWeek: [5, 1, 1, 3] });
    const days = cron.split(" ")[4].split(",").map(Number);

    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
  });

  it("never emits a day-of-month outside 1-31", () => {
    for (const day of [1, 15, 28, 31]) {
      const dom = Number(presetToCron("monthly", { ...DEFAULT_OPTIONS, dayOfMonth: day, time: "00:15" }).split(" ")[2]);
      expect(dom).toBeGreaterThanOrEqual(1);
      expect(dom).toBeLessThanOrEqual(31);
    }
  });
});

// The stored cron is UTC and the picker is local, so the property that has to
// hold in every zone is that writing then reading gives back what was typed.
describe("round trip", () => {
  it.each(["00:00", "00:15", "06:30", "09:00", "12:00", "23:45"])(
    "preserves a daily time of %s",
    (time) => {
      const cron = presetToCron("daily", { ...DEFAULT_OPTIONS, time });

      expect(cronToOptions(cron).time).toBe(time);
    },
  );

  // Midnight-adjacent weekly times are where a hand-rolled offset gets the day
  // wrong: a local Monday 00:30 can be a Sunday or a Monday in UTC.
  it.each(["00:30", "09:00", "23:30"])("preserves weekly days at %s", (time) => {
    for (const days of [[1], [0, 6], [1, 3, 5], [0, 1, 2, 3, 4, 5, 6]]) {
      const cron = presetToCron("weekly", { ...DEFAULT_OPTIONS, time, daysOfWeek: days });
      const back = cronToOptions(cron);

      expect(back.time).toBe(time);
      expect([...back.daysOfWeek]).toEqual(days);
    }
  });

  it("preserves a mid-month day", () => {
    const cron = presetToCron("monthly", { ...DEFAULT_OPTIONS, dayOfMonth: 15, time: "23:30" });
    const back = cronToOptions(cron);

    expect(back.dayOfMonth).toBe(15);
    expect(back.time).toBe("23:30");
  });

  it("classifies what it builds", () => {
    for (const preset of ["every_30min", "hourly", "daily", "weekly", "monthly"] as const) {
      expect(cronToPreset(presetToCron(preset, DEFAULT_OPTIONS))).toBe(preset);
    }
  });
});

describe("cronToOptions", () => {
  it("falls back to the defaults for a cron it cannot read", () => {
    expect(cronToOptions("nonsense")).toEqual(DEFAULT_OPTIONS);
    expect(cronToOptions("")).toEqual(DEFAULT_OPTIONS);
  });

  it("keeps the defaults for fields the cron leaves as a wildcard", () => {
    const options = cronToOptions("0 9 * * *");

    expect(options.daysOfWeek).toEqual(DEFAULT_OPTIONS.daysOfWeek);
    expect(options.dayOfMonth).toEqual(DEFAULT_OPTIONS.dayOfMonth);
  });
});

describe("weekdayNames", () => {
  it("starts on Sunday, as cron's day-of-week field does", () => {
    expect(weekdayNames("en-US", "long")[0]).toBe("Sunday");
    expect(weekdayNames("en-US", "long")[1]).toBe("Monday");
  });

  it("localizes", () => {
    expect(weekdayNames("es", "long")[1].toLowerCase()).toContain("lunes");
  });
});
