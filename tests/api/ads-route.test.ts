import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Route-level guards for the three verbs that spend money.
 *
 * The Meta client is mocked: what matters here is what the route refuses
 * before it ever reaches Meta, and the units it hands over when it does.
 */

const meta = vi.hoisted(() => ({
  config: { accessToken: "t", adAccountId: "1234567890123456" } as
    | { accessToken: string; adAccountId: string; pageId?: string }
    | null,
  createCampaign: vi.fn(async () => ({ id: "c9" })),
  updateCampaign: vi.fn(async () => ({ success: true })),
  deleteCampaign: vi.fn(async () => ({ success: true })),
  getCampaigns: vi.fn(async () => []),
  getCampaignInsightsMap: vi.fn(async () => ({})),
  getLeadForms: vi.fn(async () => []),
  getLeads: vi.fn(async () => []),
}));

vi.mock("@/lib/meta-ads", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-ads")>("@/lib/meta-ads");
  return {
    ...actual,
    getMetaAdsConfig: () => meta.config,
    createCampaign: meta.createCampaign,
    updateCampaign: meta.updateCampaign,
    deleteCampaign: meta.deleteCampaign,
    getCampaigns: meta.getCampaigns,
    getCampaignInsightsMap: meta.getCampaignInsightsMap,
    getLeadForms: meta.getLeadForms,
    getLeads: meta.getLeads,
  };
});

beforeEach(() => {
  meta.config = { accessToken: "t", adAccountId: "1234567890123456" };
  vi.clearAllMocks();
});

function post(body: unknown) {
  return new Request("http://localhost/api/ads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown) {
  return new Request("http://localhost/api/ads", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ads", () => {
  it("converts the typed amount into Meta's minor units", async () => {
    const { POST } = await import("@/app/api/ads/route");
    const res = await POST(post({ name: "Verano", objective: "OUTCOME_SALES", dailyBudget: 12.5 }));

    expect(res.status).toBe(201);
    expect(meta.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ dailyBudgetMinor: 1250 }),
    );
    // The route promises what the client guarantees.
    expect(await res.json()).toEqual({ id: "c9", status: "PAUSED" });
  });

  it("rounds rather than truncating a fractional cent", async () => {
    const { POST } = await import("@/app/api/ads/route");
    await POST(post({ name: "x", objective: "OUTCOME_SALES", dailyBudget: 10.005 }));
    expect(meta.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ dailyBudgetMinor: 1001 }),
    );
  });

  it("refuses an objective Meta no longer accepts on create", async () => {
    const { POST } = await import("@/app/api/ads/route");
    // A real enum, but a legacy one: it comes back on old campaigns and is
    // rejected on new ones.
    const res = await POST(post({ name: "x", objective: "LINK_CLICKS" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_field", field: "objective" });
    expect(meta.createCampaign).not.toHaveBeenCalled();
  });

  it("refuses a campaign carrying both budgets", async () => {
    const { POST } = await import("@/app/api/ads/route");
    const res = await POST(
      post({ name: "x", objective: "OUTCOME_SALES", dailyBudget: 10, lifetimeBudget: 100 }),
    );

    expect(res.status).toBe(400);
    expect(meta.createCampaign).not.toHaveBeenCalled();
  });

  it("refuses a zero or negative budget instead of dropping it", async () => {
    const { POST } = await import("@/app/api/ads/route");
    for (const dailyBudget of [0, -5]) {
      const res = await POST(post({ name: "x", objective: "OUTCOME_SALES", dailyBudget }));
      expect(res.status).toBe(400);
    }
    expect(meta.createCampaign).not.toHaveBeenCalled();
  });

  it("refuses a made-up special ad category", async () => {
    const { POST } = await import("@/app/api/ads/route");
    const res = await POST(
      post({ name: "x", objective: "OUTCOME_SALES", specialAdCategories: ["BANANAS"] }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "specialAdCategories" });
  });

  it("requires a name", async () => {
    const { POST } = await import("@/app/api/ads/route");
    const res = await POST(post({ name: "   ", objective: "OUTCOME_SALES" }));
    expect(await res.json()).toMatchObject({ code: "missing_field", field: "name" });
  });

  it("answers 200 with a code, not an error, when Meta isn't connected", async () => {
    meta.config = null;
    const { POST } = await import("@/app/api/ads/route");
    const res = await POST(post({ name: "x", objective: "OUTCOME_SALES" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: "not_configured" });
  });
});

describe("PATCH /api/ads", () => {
  it("passes through only the fields it was given", async () => {
    const { PATCH } = await import("@/app/api/ads/route");
    await PATCH(patch({ id: "c1", status: "PAUSED" }));
    expect(meta.updateCampaign).toHaveBeenCalledWith("c1", { status: "PAUSED" });
  });

  it("refuses DELETED and ARCHIVED as status writes", async () => {
    const { PATCH } = await import("@/app/api/ads/route");
    for (const status of ["DELETED", "ARCHIVED", "ACTIVEISH"]) {
      const res = await PATCH(patch({ id: "c1", status }));
      expect(res.status).toBe(400);
    }
    expect(meta.updateCampaign).not.toHaveBeenCalled();
  });

  it("refuses a rename to nothing", async () => {
    const { PATCH } = await import("@/app/api/ads/route");
    const res = await PATCH(patch({ id: "c1", name: "  " }));
    expect(await res.json()).toMatchObject({ code: "invalid_field", field: "name" });
  });

  it("refuses a request that asks for no change at all", async () => {
    const { PATCH } = await import("@/app/api/ads/route");
    const res = await PATCH(patch({ id: "c1" }));
    expect(await res.json()).toMatchObject({ code: "nothing_to_update" });
  });

  it("requires an id", async () => {
    const { PATCH } = await import("@/app/api/ads/route");
    const res = await PATCH(patch({ status: "PAUSED" }));
    expect(await res.json()).toMatchObject({ code: "missing_field", field: "id" });
  });
});

describe("DELETE /api/ads", () => {
  it("deletes the campaign named in the query string", async () => {
    const { DELETE } = await import("@/app/api/ads/route");
    const res = await DELETE(new Request("http://localhost/api/ads?id=c1", { method: "DELETE" }));

    expect(res.status).toBe(200);
    expect(meta.deleteCampaign).toHaveBeenCalledWith("c1");
  });

  it("requires an id rather than deleting something unnamed", async () => {
    const { DELETE } = await import("@/app/api/ads/route");
    const res = await DELETE(new Request("http://localhost/api/ads", { method: "DELETE" }));

    expect(await res.json()).toMatchObject({ code: "missing_field", field: "id" });
    expect(meta.deleteCampaign).not.toHaveBeenCalled();
  });
});

describe("GET /api/ads", () => {
  it("says the Page is missing rather than failing the leads tab", async () => {
    const { GET } = await import("@/app/api/ads/route");
    const res = await GET(new Request("http://localhost/api/ads?tab=leads"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ leads: [], forms: [], pageMissing: true });
    expect(meta.getLeadForms).not.toHaveBeenCalled();
  });

  it("reads leads once a Page is connected", async () => {
    meta.config = { accessToken: "t", adAccountId: "1234567890123456", pageId: "99" };
    const { GET } = await import("@/app/api/ads/route");
    await GET(new Request("http://localhost/api/ads?tab=leads"));

    expect(meta.getLeadForms).toHaveBeenCalled();
    expect(meta.getLeads).toHaveBeenCalled();
  });

  it("still returns campaigns when the insights call fails on its own", async () => {
    meta.getCampaigns.mockResolvedValueOnce([{ id: "c1" }] as never);
    meta.getCampaignInsightsMap.mockRejectedValueOnce(new Error("rate limited"));
    const { GET } = await import("@/app/api/ads/route");
    const res = await GET(new Request("http://localhost/api/ads?tab=campaigns"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ campaigns: [{ id: "c1" }], insights: {} });
  });
});
