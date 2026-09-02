import { describe, expect, it } from "vitest";

import { countByDay, formatDayTick, TREND_DAYS } from "@/lib/chart-data";

/**
 * The bucketing behind every daily chart.
 *
 * The cases that matter are the ones that would silently redraw the data: a
 * quiet day being dropped instead of counted as zero, and a timestamp landing
 * in the wrong column because it was read in the reader's zone rather than the
 * bucket's.
 */

const NOW = new Date("2026-09-01T18:30:00Z");

describe("countByDay", () => {
  it("returns one bucket per day, oldest first, ending today", () => {
    const days = countByDay([], { locale: "en", now: NOW });
    expect(days).toHaveLength(TREND_DAYS);
    expect(days[0].key).toBe("2026-08-19");
    expect(days[TREND_DAYS - 1].key).toBe("2026-09-01");
  });

  it("keeps empty days as zero rather than dropping them", () => {
    const days = countByDay(["2026-09-01T09:00:00Z"], { locale: "en", now: NOW });
    expect(days.filter((d) => d.value === 0)).toHaveLength(TREND_DAYS - 1);
    expect(days[TREND_DAYS - 1].value).toBe(1);
  });

  it("counts several timestamps into the same UTC day", () => {
    const days = countByDay(
      ["2026-08-31T00:10:00Z", "2026-08-31T23:50:00Z", "2026-09-01T00:10:00Z"],
      { locale: "en", now: NOW },
    );
    expect(days[TREND_DAYS - 2].value).toBe(2);
    expect(days[TREND_DAYS - 1].value).toBe(1);
  });

  it("ignores timestamps outside the window instead of clamping them into an edge bucket", () => {
    const days = countByDay(
      ["2020-01-01T00:00:00Z", "2027-01-01T00:00:00Z", "not a date"],
      { locale: "en", now: NOW },
    );
    expect(days.every((d) => d.value === 0)).toBe(true);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const days = countByDay([new Date("2026-09-01T12:00:00Z")], { locale: "en", now: NOW });
    expect(days[TREND_DAYS - 1].value).toBe(1);
  });
});

describe("formatDayTick", () => {
  it("labels a bucket by its own UTC date, not the reader's", () => {
    expect(formatDayTick("2026-09-01", "en")).toBe("Sep 1");
    expect(formatDayTick("2026-09-01", "es")).toBe("1 sept");
  });
});
