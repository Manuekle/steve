import { describe, expect, it } from "vitest";
import { recommendPlan } from "@/lib/pricing-simulator";

describe("recommendPlan", () => {
  it("recomienda Pro para volumen pequeño", () => {
    const r = recommendPlan({
      dailyMessages: 30,
      monthlyCalls: 5,
      channels: 1,
      teamSize: 3,
      needsAutomation: false,
    });
    expect(r.recommended).toBe("pro");
    expect(r.businessSize).toBe("small");
  });

  it("recomienda Managed para volumen mediano", () => {
    const r = recommendPlan({
      dailyMessages: 250,
      monthlyCalls: 30,
      channels: 2,
      teamSize: 12,
      needsAutomation: true,
    });
    expect(r.recommended).toBe("managed");
    expect(r.businessSize).toBe("medium");
  });

  it("recomienda Enterprise para volumen grande", () => {
    const r = recommendPlan({
      dailyMessages: 900,
      monthlyCalls: 200,
      channels: 3,
      teamSize: 30,
      needsAutomation: true,
    });
    expect(r.recommended).toBe("enterprise");
    expect(r.businessSize).toBe("large");
  });

  it("emite gauges 0-100", () => {
    const r = recommendPlan({
      dailyMessages: 80,
      monthlyCalls: 20,
      channels: 2,
      teamSize: 3,
      needsAutomation: true,
    });
    for (const v of Object.values(r.gauges)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
