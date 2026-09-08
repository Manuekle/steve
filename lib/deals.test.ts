import { describe, it, expect } from "vitest";
import {
  averageDaysToClose,
  averageWonValue,
  byStage,
  daysSince,
  defaultCurrency,
  formatMoney,
  isOverdue,
  isStale,
  pipelineTotals,
  winRate,
  wonBySource,
} from "./deals";
import type { Deal } from "@/lib/types";

const NOW = new Date("2026-09-04T12:00:00.000Z");

function deal(over: Partial<Deal> & Pick<Deal, "id">): Deal {
  return {
    contactId: "ct-1",
    title: "Deal",
    value: 100,
    currency: "ARS",
    stage: "lead",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-04T12:00:00.000Z",
    ...over,
  };
}

describe("pipelineTotals", () => {
  it("keeps currencies apart instead of adding them together", () => {
    const rows = pipelineTotals([
      deal({ id: "a", value: 100, currency: "ARS", stage: "proposal" }),
      deal({ id: "b", value: 50, currency: "USD", stage: "proposal" }),
    ]);
    expect(rows.map((r) => r.currency).sort()).toEqual(["ARS", "USD"]);
    expect(rows.find((r) => r.currency === "ARS")?.open).toBe(100);
    expect(rows.find((r) => r.currency === "USD")?.open).toBe(50);
  });

  it("splits open, won and lost, and never counts a closed deal as pipeline", () => {
    const [row] = pipelineTotals([
      deal({ id: "a", value: 100, stage: "negotiation" }),
      deal({ id: "b", value: 200, stage: "won" }),
      deal({ id: "c", value: 300, stage: "lost" }),
    ]);
    expect(row.open).toBe(100);
    expect(row.won).toBe(200);
    expect(row.lost).toBe(300);
    expect(row.openCount).toBe(1);
  });

  it("weights the forecast by stage rather than by face value", () => {
    const [row] = pipelineTotals([
      deal({ id: "a", value: 1000, stage: "lead" }),
      deal({ id: "b", value: 1000, stage: "negotiation" }),
    ]);
    expect(row.open).toBe(2000);
    // 1000 * 0.1 + 1000 * 0.8
    expect(row.forecast).toBeCloseTo(900);
  });

  it("survives a deal with a broken value", () => {
    const [row] = pipelineTotals([deal({ id: "a", value: Number.NaN })]);
    expect(row.open).toBe(0);
  });

  it("leads with the currency carrying the most money", () => {
    const rows = pipelineTotals([
      deal({ id: "a", value: 10, currency: "USD", stage: "proposal" }),
      deal({ id: "b", value: 9000, currency: "ARS", stage: "proposal" }),
    ]);
    expect(rows[0].currency).toBe("ARS");
  });
});

describe("winRate", () => {
  it("ignores open deals, so a full pipeline is not a 0% win rate", () => {
    expect(winRate([deal({ id: "a", stage: "won" }), deal({ id: "b", stage: "lost" })])).toBe(0.5);
    expect(
      winRate([
        deal({ id: "a", stage: "won" }),
        deal({ id: "b", stage: "lost" }),
        deal({ id: "c", stage: "proposal" }),
      ]),
    ).toBe(0.5);
  });

  it("says nothing rather than zero when nothing has closed", () => {
    expect(winRate([deal({ id: "a", stage: "meeting" })])).toBeUndefined();
    expect(winRate([])).toBeUndefined();
  });
});

describe("averages", () => {
  it("averages only won deals of that currency", () => {
    const deals = [
      deal({ id: "a", value: 100, stage: "won" }),
      deal({ id: "b", value: 300, stage: "won" }),
      deal({ id: "c", value: 999, stage: "proposal" }),
      deal({ id: "d", value: 5, stage: "won", currency: "USD" }),
    ];
    expect(averageWonValue(deals, "ARS")).toBe(200);
    expect(averageWonValue(deals, "EUR")).toBeUndefined();
  });

  it("measures days to close from created to closed", () => {
    const days = averageDaysToClose([
      deal({
        id: "a",
        stage: "won",
        createdAt: "2026-08-01T00:00:00.000Z",
        closedAt: "2026-08-11T00:00:00.000Z",
      }),
    ]);
    expect(days).toBe(10);
  });
});

describe("attention flags", () => {
  it("calls an untouched open deal stale after a fortnight", () => {
    expect(isStale(deal({ id: "a", updatedAt: "2026-08-01T12:00:00.000Z" }), NOW)).toBe(true);
    expect(isStale(deal({ id: "b", updatedAt: "2026-09-01T12:00:00.000Z" }), NOW)).toBe(false);
  });

  it("never calls a closed deal stale — it is finished, not neglected", () => {
    const old = { updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(isStale(deal({ id: "a", stage: "won", ...old }), NOW)).toBe(false);
    expect(isStale(deal({ id: "b", stage: "lost", ...old }), NOW)).toBe(false);
  });

  it("flags an open deal past its expected close, and only then", () => {
    expect(isOverdue(deal({ id: "a", expectedCloseAt: "2026-09-01T00:00:00.000Z" }), NOW)).toBe(true);
    expect(isOverdue(deal({ id: "b", expectedCloseAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isOverdue(deal({ id: "c" }), NOW)).toBe(false);
    expect(
      isOverdue(deal({ id: "d", stage: "won", expectedCloseAt: "2026-01-01T00:00:00.000Z" }), NOW),
    ).toBe(false);
  });

  it("reads a broken timestamp as zero days rather than NaN", () => {
    expect(daysSince("not a date", NOW)).toBe(0);
  });
});

describe("byStage", () => {
  it("returns every stage, empty ones included", () => {
    const groups = byStage([deal({ id: "a", stage: "proposal" })]);
    expect(Object.keys(groups)).toHaveLength(7);
    expect(groups.proposal).toHaveLength(1);
    expect(groups.won).toEqual([]);
  });

  it("parks a stage this build doesn't know in lead rather than dropping it", () => {
    const groups = byStage([deal({ id: "a", stage: "from_the_future" as Deal["stage"] })]);
    expect(groups.lead).toHaveLength(1);
  });
});

describe("wonBySource", () => {
  it("ranks won money by where it came from", () => {
    const rows = wonBySource(
      [
        deal({ id: "a", stage: "won", value: 100, source: "form:presupuesto" }),
        deal({ id: "b", stage: "won", value: 400, source: "whatsapp" }),
        deal({ id: "c", stage: "lost", value: 900, source: "whatsapp" }),
        deal({ id: "d", stage: "won", value: 50 }),
      ],
      "ARS",
    );
    expect(rows[0]).toEqual({ source: "whatsapp", value: 400, count: 1 });
    expect(rows.at(-1)?.source).toBe("—");
  });
});

describe("formatMoney", () => {
  it("falls back to a plain number rather than throwing on a bad code", () => {
    expect(formatMoney(1000, "NOTACODE", "en")).toContain("1,000");
  });

  it("renders a real code as currency", () => {
    expect(formatMoney(1500, "USD", "en")).toContain("1,500");
  });
});

describe("defaultCurrency", () => {
  it("uses what the account already quotes in", () => {
    expect(
      defaultCurrency([
        deal({ id: "a", currency: "USD" }),
        deal({ id: "b", currency: "USD" }),
        deal({ id: "c", currency: "ARS" }),
      ]),
    ).toBe("USD");
  });

  it("falls back by language when there is nothing to go on", () => {
    expect(defaultCurrency([], "en")).toBe("USD");
    expect(defaultCurrency([], "es")).toBe("ARS");
  });
});
