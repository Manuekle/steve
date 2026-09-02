import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

let store: Record<string, string | undefined> = {};

vi.mock("./credentials", () => ({
  getCredentialSync: (key: string) => store[key],
}));

/** Records every call and answers each with the next queued body. */
function stubFetch(responses: Array<{ ok?: boolean; status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const next = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      json: async () => next.body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  store = {
    META_ACCESS_TOKEN: "EAAtoken",
    META_AD_ACCOUNT_ID: "1234567890123456",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getMetaAdsConfig", () => {
  it("is null until both the token and the account id are set", async () => {
    const { getMetaAdsConfig } = await import("./meta-ads");
    store = {};
    expect(getMetaAdsConfig()).toBeNull();

    store.META_ACCESS_TOKEN = "EAAtoken";
    expect(getMetaAdsConfig()).toBeNull();

    store.META_AD_ACCOUNT_ID = "1234567890123456";
    expect(getMetaAdsConfig()).toEqual({
      accessToken: "EAAtoken",
      adAccountId: "1234567890123456",
    });
  });

  it("carries the Page id only when one is configured", async () => {
    const { getMetaAdsConfig } = await import("./meta-ads");
    expect(getMetaAdsConfig()?.pageId).toBeUndefined();
    store.META_PAGE_ID = "99887766";
    expect(getMetaAdsConfig()?.pageId).toBe("99887766");
  });
});

describe("request shape", () => {
  it("sends the token as a header and never in the URL", async () => {
    const calls = stubFetch([{ body: { data: [] } }]);
    const { getCampaigns } = await import("./meta-ads");
    await getCampaigns();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain("access_token");
    expect(calls[0].url).not.toContain("EAAtoken");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer EAAtoken",
    );
  });

  it("targets a Graph version Meta still supports", async () => {
    const calls = stubFetch([{ body: { data: [] } }]);
    const { getCampaigns } = await import("./meta-ads");
    await getCampaigns();

    const version = /graph\.facebook\.com\/v(\d+)\.0\//.exec(calls[0].url)?.[1];
    // v23.0 and below answer with `x-ad-api-version-warning` and are on their
    // way to failing outright. The file shipped on v21.0 for a long time.
    expect(Number(version)).toBeGreaterThanOrEqual(24);
  });

  it("puts GET params on the query string and prefixes the account id", async () => {
    const calls = stubFetch([{ body: { data: [] } }]);
    const { getCampaigns } = await import("./meta-ads");
    await getCampaigns();

    expect(calls[0].url).toContain("/act_1234567890123456/campaigns");
    expect(calls[0].url).toContain("fields=");
    expect(calls[0].init.method).toBe("GET");
  });

  it("raises Meta's advertiser-facing sentence, with its code", async () => {
    stubFetch([
      {
        ok: false,
        status: 400,
        body: {
          error: {
            message: "Invalid parameter",
            error_user_msg: "Your daily budget is below the minimum.",
            code: 100,
            error_subcode: 1487079,
          },
        },
      },
    ]);
    const { getCampaigns, MetaApiError } = await import("./meta-ads");

    await expect(getCampaigns()).rejects.toThrow("Your daily budget is below the minimum.");
    await expect(getCampaigns()).rejects.toBeInstanceOf(MetaApiError);
    await getCampaigns().catch((err: InstanceType<typeof MetaApiError>) => {
      expect(err.code).toBe(100);
      expect(err.subcode).toBe(1487079);
      expect(err.status).toBe(400);
    });
  });
});

describe("insights", () => {
  it("asks once for the whole account and keys the result by campaign", async () => {
    const calls = stubFetch([
      {
        body: {
          data: [
            { campaign_id: "c1", impressions: "10", clicks: "2" },
            { campaign_id: "c2", spend: "5.5" },
          ],
        },
      },
    ]);
    const { getCampaignInsightsMap } = await import("./meta-ads");
    const map = await getCampaignInsightsMap("last_7d");

    // One request for every campaign, not one per campaign.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/act_1234567890123456/insights");
    expect(calls[0].url).toContain("level=campaign");
    expect(calls[0].url).toContain("date_preset=last_7d");

    expect(Object.keys(map)).toEqual(["c1", "c2"]);
    expect(map.c1.impressions).toBe("10");
    // Fields Meta omitted still come back as zeroes rather than undefined.
    expect(map.c1.spend).toBe("0");
    expect(map.c2.spend).toBe("5.5");
  });
});

describe("leads", () => {
  it("reads forms off the Page, not off the ad account", async () => {
    store.META_PAGE_ID = "99887766";
    const calls = stubFetch([{ body: { data: [] } }]);
    const { getLeadForms } = await import("./meta-ads");
    await getLeadForms();

    expect(calls[0].url).toContain("/99887766/leadgen_forms");
    expect(calls[0].url).not.toContain("act_");
  });

  it("returns nothing at all when no Page is connected", async () => {
    const calls = stubFetch([{ body: { data: [] } }]);
    const { getLeadForms, getLeads } = await import("./meta-ads");

    expect(await getLeadForms()).toEqual([]);
    expect(await getLeads()).toEqual([]);
    // No Page means no valid request to make, so none is made.
    expect(calls).toHaveLength(0);
  });

  it("reads each form's /leads edge and sorts newest first", async () => {
    store.META_PAGE_ID = "99887766";
    const calls = stubFetch([
      { body: { data: [{ id: "f1" }, { id: "f2" }] } },
      { body: { data: [{ id: "l1", form_id: "f1", created_time: "2026-01-01T00:00:00+0000" }] } },
      { body: { data: [{ id: "l2", form_id: "f2", created_time: "2026-06-01T00:00:00+0000" }] } },
    ]);
    const { getLeads } = await import("./meta-ads");
    const leads = await getLeads();

    // The path that used to fetch the form object itself and silently return
    // nothing.
    expect(calls[1].url).toContain("/f1/leads");
    expect(calls[2].url).toContain("/f2/leads");
    expect(leads.map((l) => l.id)).toEqual(["l2", "l1"]);
  });

  it("keeps the other forms when one of them fails", async () => {
    store.META_PAGE_ID = "99887766";
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        call++;
        if (call === 1) {
          return { ok: true, status: 200, json: async () => ({ data: [{ id: "f1" }, { id: "f2" }] }) } as unknown as Response;
        }
        if (url.includes("/f1/leads")) {
          return { ok: false, status: 403, json: async () => ({ error: { message: "no access", code: 200 } }) } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: "l2", form_id: "f2", created_time: "2026-06-01T00:00:00+0000" }] }),
        } as unknown as Response;
      }),
    );

    const { getLeads } = await import("./meta-ads");
    expect((await getLeads()).map((l) => l.id)).toEqual(["l2"]);
  });
});

describe("writes", () => {
  /** The form body Meta was actually sent. */
  function body(init: RequestInit): URLSearchParams {
    return new URLSearchParams(String(init.body));
  }

  it("creates paused, whatever the caller wants", async () => {
    const calls = stubFetch([{ body: { id: "c9" } }]);
    const { createCampaign } = await import("./meta-ads");

    const created = await createCampaign({
      name: "Verano",
      objective: "OUTCOME_SALES",
      dailyBudgetMinor: 2500,
    });

    expect(created).toEqual({ id: "c9" });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toContain("/act_1234567890123456/campaigns");

    const sent = body(calls[0].init);
    expect(sent.get("status")).toBe("PAUSED");
    expect(sent.get("name")).toBe("Verano");
    expect(sent.get("objective")).toBe("OUTCOME_SALES");
    expect(sent.get("daily_budget")).toBe("2500");
    // Required on every create; the empty array is the "none of these" answer.
    expect(sent.get("special_ad_categories")).toBe("[]");
  });

  it("JSON-encodes the special ad categories array", async () => {
    const calls = stubFetch([{ body: { id: "c9" } }]);
    const { createCampaign } = await import("./meta-ads");
    await createCampaign({
      name: "Alquiler",
      objective: "OUTCOME_LEADS",
      specialAdCategories: ["HOUSING"],
    });
    expect(body(calls[0].init).get("special_ad_categories")).toBe('["HOUSING"]');
  });

  it("omits a budget the caller did not give", async () => {
    const calls = stubFetch([{ body: { id: "c9" } }]);
    const { createCampaign } = await import("./meta-ads");
    await createCampaign({ name: "Sin presupuesto", objective: "OUTCOME_TRAFFIC" });

    const sent = body(calls[0].init);
    expect(sent.has("daily_budget")).toBe(false);
    expect(sent.has("lifetime_budget")).toBe(false);
  });

  it("updates only the fields it was handed", async () => {
    const calls = stubFetch([{ body: { success: true } }]);
    const { updateCampaign } = await import("./meta-ads");
    await updateCampaign("c1", { status: "ACTIVE" });

    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toMatch(/\/c1$/);

    const sent = body(calls[0].init);
    expect(sent.get("status")).toBe("ACTIVE");
    expect(sent.has("name")).toBe(false);
    expect(sent.has("daily_budget")).toBe(false);
  });

  it("refuses an update with nothing in it", async () => {
    stubFetch([{ body: { success: true } }]);
    const { updateCampaign } = await import("./meta-ads");
    await expect(updateCampaign("c1", {})).rejects.toThrow(/No campaign fields/);
  });

  it("deletes with DELETE, not with a status write", async () => {
    const calls = stubFetch([{ body: { success: true } }]);
    const { deleteCampaign } = await import("./meta-ads");
    await deleteCampaign("c1");

    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toMatch(/\/c1$/);
    expect(calls[0].init.body).toBeUndefined();
  });
});
