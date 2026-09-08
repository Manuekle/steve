import { describe, expect, it } from "vitest";
import {
  changeImpact,
  compareRows,
  daysBetween,
  defaultSite,
  formatChange,
  formatPercentChange,
  formatPositionChange,
  lostRows,
  metricDelta,
  periodsFor,
  rankByMovement,
  shiftDays,
  siteLabel,
  type SearchRow,
} from "./seo-metrics";

function row(key: string, over: Partial<SearchRow> = {}): SearchRow {
  return { key, clicks: 0, impressions: 0, ctr: 0, position: 0, ...over };
}

describe("periodsFor", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("ends the window two days back, where Search Console's data is final", () => {
    expect(periodsFor("28d", now).current.end).toBe("2026-09-06");
  });

  it("gives the range the number of days its name claims", () => {
    for (const range of ["7d", "28d", "90d", "365d"] as const) {
      const { current, previous } = periodsFor(range, now);
      const days = Number(range.replace("d", ""));
      expect(daysBetween(current.start, current.end)).toBe(days);
      expect(daysBetween(previous.start, previous.end)).toBe(days);
    }
  });

  it("puts the earlier window immediately before, never overlapping", () => {
    const { current, previous } = periodsFor("28d", now);
    expect(shiftDays(previous.end, 1)).toBe(current.start);
    expect(previous.end < current.start).toBe(true);
  });

  it("crosses a month boundary without landing on a day that isn't", () => {
    const { current } = periodsFor("7d", new Date("2026-03-02T00:00:00Z"));
    expect(current).toEqual({ start: "2026-02-22", end: "2026-02-28" });
  });
});

describe("metricDelta", () => {
  it("reports growth from zero as a change with no percentage", () => {
    // "+∞%" is noise and "+100%" is false; the caller says "new" instead.
    expect(metricDelta(40, 0)).toMatchObject({ change: 40, percent: null, direction: "up" });
  });

  it("reads a decimal tail as flat rather than as a trend", () => {
    expect(metricDelta(12.4, 12.4).direction).toBe("flat");
  });

  it("keeps direction about the number, not about whether it is good news", () => {
    // Position fell from 14 to 9 — an improvement, reported as `down`, because
    // deciding that a fall is good is the caller's job.
    expect(metricDelta(9, 14).direction).toBe("down");
  });
});

describe("compareRows", () => {
  const current = [
    row("zapatos rojos", { clicks: 120, impressions: 3000, ctr: 0.04, position: 4.2 }),
    row("zapatos baratos", { clicks: 30, impressions: 900, ctr: 0.033, position: 11.5 }),
  ];
  const previous = [
    // Deliberately in a different order: the two windows come back ranked by
    // clicks, so a positional join would pair the wrong queries.
    row("zapatos baratos", { clicks: 10, impressions: 800, ctr: 0.0125, position: 18.1 }),
    row("zapatos rojos", { clicks: 90, impressions: 2600, ctr: 0.0346, position: 6.6 }),
  ];

  it("joins on the term, not on the row's position in the list", () => {
    const [red, cheap] = compareRows(current, previous);
    expect(red?.clicksChange).toBe(30);
    expect(cheap?.clicksChange).toBe(20);
  });

  it("signs a ranking change so that a climb is positive", () => {
    // 6.6 → 4.2 is two and a bit places up the page.
    expect(compareRows(current, previous)[0]?.positionChange).toBeCloseTo(2.4, 5);
  });

  it("marks a term with no earlier row as new instead of inventing a delta", () => {
    const [fresh] = compareRows([row("botas", { clicks: 12 })], previous);
    expect(fresh?.isNew).toBe(true);
    expect(fresh?.previous).toBeUndefined();
    expect(fresh?.positionChange).toBe(0);
  });
});

describe("lostRows", () => {
  it("surfaces terms that brought clicks before and none now", () => {
    const lost = lostRows(
      [row("botas", { clicks: 5 })],
      [row("sandalias", { clicks: 40 }), row("botas", { clicks: 9 }), row("gorras", { clicks: 2 })],
    );
    expect(lost.map((r) => r.key)).toEqual(["sandalias", "gorras"]);
  });

  it("ignores terms that never brought a click, which are not a loss", () => {
    expect(lostRows([], [row("chanclas", { clicks: 0, impressions: 400 })])).toEqual([]);
  });
});

describe("rankByMovement", () => {
  it("puts the biggest gain first and the biggest loss last", () => {
    const moved = rankByMovement(
      compareRows(
        [row("a", { clicks: 10 }), row("b", { clicks: 50 }), row("c", { clicks: 7 })],
        [row("a", { clicks: 60 }), row("b", { clicks: 10 }), row("c", { clicks: 7 })],
      ),
      10,
    );
    // `c` did not move, so it is not in a list of movers.
    expect(moved.map((r) => r.key)).toEqual(["b", "a"]);
  });
});

describe("changeImpact", () => {
  /** Fourteen days at 10 clicks, then fourteen at 30. */
  const series = Array.from({ length: 28 }, (_, i) =>
    row(shiftDays("2026-08-01", i), { clicks: i < 14 ? 10 : 30 }),
  );

  it("compares the days after the change against the days before it", () => {
    const impact = changeImpact(series, "2026-08-15", 7);
    expect(impact).toMatchObject({ beforeAverage: 10, afterAverage: 30, beforeDays: 7, afterDays: 7 });
    expect(impact?.delta.percent).toBeCloseTo(2, 5);
  });

  it("counts the change's own day as after — that is when it was live", () => {
    expect(changeImpact(series, "2026-08-15", 1)).toMatchObject({
      beforeDays: 1,
      afterDays: 1,
      afterAverage: 30,
    });
  });

  it("averages rather than sums, so a short 'after' is not read as a collapse", () => {
    // Three days of data after the change against a full week before it.
    const impact = changeImpact(series.slice(0, 17), "2026-08-15", 7);
    expect(impact).toMatchObject({ beforeDays: 7, afterDays: 3, beforeAverage: 10, afterAverage: 30 });
  });

  it("reports nothing for a change outside the series on screen", () => {
    expect(changeImpact(series, "2025-01-01", 7)).toBeNull();
  });
});

describe("formatting", () => {
  it("signs a change with a real minus rather than a hyphen", () => {
    expect(formatChange(-9, "en")).toBe("−9");
    expect(formatChange(128, "en")).toBe("+128");
    expect(formatChange(0)).toBe("0");
  });

  it("drops the decimal once a percentage is big enough not to need it", () => {
    expect(formatPercentChange(0.042)).toBe("+4.2%");
    expect(formatPercentChange(1.5)).toBe("+150%");
    expect(formatPercentChange(-0.5)).toBe("−50%");
    expect(formatPercentChange(null)).toBeNull();
  });

  it("says nothing about a ranking that barely moved", () => {
    expect(formatPositionChange(0.02)).toBeNull();
    expect(formatPositionChange(2.44)).toBe("+2.4");
  });
});

describe("properties", () => {
  it("prefers a domain property, which covers every subdomain at once", () => {
    expect(
      defaultSite([{ url: "https://tienda.example.com/", permission: "siteOwner" }, { url: "sc-domain:example.com", permission: "siteOwner" }]),
    ).toBe("sc-domain:example.com");
  });

  it("has no default when the account has verified nothing", () => {
    expect(defaultSite([])).toBeNull();
  });

  it("prints a property the way a person reads it", () => {
    expect(siteLabel("sc-domain:example.com")).toBe("example.com");
    expect(siteLabel("https://www.example.com/")).toBe("www.example.com");
  });
});
