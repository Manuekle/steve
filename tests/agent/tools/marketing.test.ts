import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "eve/tools";
import type { Contact, Deal, Form, FormResponse } from "../../../lib/types";

const getContactBySession = vi.fn();
const listContacts = vi.fn();
const listDeals = vi.fn();
const listForms = vi.fn();
const listFormResponses = vi.fn();
const getCampaigns = vi.fn();
const getCampaignInsightsMap = vi.fn();
const getMetaAdsConfig = vi.fn();

vi.mock("../../../lib/business-store", () => ({
  getContactBySession: (...a: unknown[]) => getContactBySession(...(a as [])),
  listContacts: (...a: unknown[]) => listContacts(...(a as [])),
  listDeals: (...a: unknown[]) => listDeals(...(a as [])),
  listForms: (...a: unknown[]) => listForms(...(a as [])),
  listFormResponses: (...a: unknown[]) => listFormResponses(...(a as [])),
}));
vi.mock("../../../lib/meta-ads", () => ({
  getCampaigns: (...a: unknown[]) => getCampaigns(...(a as [])),
  getCampaignInsightsMap: (...a: unknown[]) => getCampaignInsightsMap(...(a as [])),
  getMetaAdsConfig: (...a: unknown[]) => getMetaAdsConfig(...(a as [])),
}));
vi.mock("../../../lib/agent-scope", () => ({ assertToolAllowed: async () => undefined }));

const marketing = (await import("../../../agent/tools/marketing")).default;

const fakeCtx = { session: { id: "s-1" } } as unknown as ToolContext;
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: "ct-1",
    name: "Marta",
    channel: "web",
    status: "open",
    source: "web",
    attributes: {},
    lastMessageAt: ago(1),
    createdAt: ago(30),
    ...over,
  };
}

function deal(over: Partial<Deal> = {}): Deal {
  return {
    id: "dl-1",
    contactId: "ct-1",
    title: "Reforma",
    value: 1000,
    currency: "ARS",
    stage: "won",
    createdAt: ago(30),
    updatedAt: ago(1),
    ...over,
  };
}

function form(over: Partial<Form> = {}): Form {
  return {
    id: "fm-1",
    slug: "presupuesto",
    name: "Presupuesto",
    description: "",
    status: "published",
    steps: [
      {
        id: "st-1",
        title: "Datos",
        fields: [
          { id: "f1", type: "short_text", label: "Nombre", required: true },
          { id: "f2", type: "short_text", label: "Email", required: true },
        ],
      },
    ],
    scoring: { hot: 8, warm: 4 },
    createdAt: ago(30),
    updatedAt: ago(1),
    ...over,
  } as Form;
}

function response(over: Partial<FormResponse> = {}): FormResponse {
  return {
    id: "fr-1",
    formId: "fm-1",
    answers: [],
    score: 6,
    temperature: "warm",
    partial: false,
    startedAt: ago(2),
    updatedAt: ago(2),
    ...over,
  };
}

beforeEach(() => {
  getContactBySession.mockReset().mockResolvedValue(contact());
  listContacts.mockReset().mockResolvedValue([contact()]);
  listDeals.mockReset().mockResolvedValue([deal()]);
  listForms.mockReset().mockResolvedValue([form()]);
  listFormResponses.mockReset().mockResolvedValue([response()]);
  getMetaAdsConfig.mockReset().mockReturnValue({ accessToken: "t", adAccountId: "act_1" });
  getCampaigns.mockReset().mockResolvedValue([]);
  getCampaignInsightsMap.mockReset().mockResolvedValue({});
});

describe("marketing", () => {
  it.each(["whatsapp", "instagram", "form", "voice"] as const)(
    "refuses off the owner's console (%s)",
    async (channel) => {
      getContactBySession.mockResolvedValue(contact({ channel }));

      const result = await marketing.execute({ action: "ads" }, fakeCtx);

      expect(result.ok).toBe(false);
      expect(getCampaigns).not.toHaveBeenCalled();
    },
  );

  // Not connected is a setup answer, not an error to retry.
  it("says Meta is not connected instead of failing", async () => {
    getMetaAdsConfig.mockReturnValue(null);

    const result = await marketing.execute({ action: "ads" }, fakeCtx);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not connected");
    expect(getCampaigns).not.toHaveBeenCalled();
  });

  // Budgets arrive in cents and spend in whole units. Reporting one as the
  // other is off by a hundred, in money.
  it("normalises the budget out of minor units and leaves spend alone", async () => {
    getCampaigns.mockResolvedValue([
      {
        id: "c1",
        name: "Verano",
        status: "ACTIVE",
        objective: "OUTCOME_LEADS",
        daily_budget: "500000",
        created_time: ago(10),
        updated_time: ago(1),
      },
    ]);
    getCampaignInsightsMap.mockResolvedValue({
      c1: { impressions: "1000", clicks: "50", spend: "1234.56", reach: "900", cpc: "24.7", cpm: "1", ctr: "5" },
    });

    const result = await marketing.execute({ action: "ads" }, fakeCtx);

    expect(result.campaigns?.[0].budget).toBe(5000);
    expect(result.campaigns?.[0].budgetKind).toBe("daily");
    expect(result.campaigns?.[0].spend).toBe(1234.56);
  });

  it("derives leads and cost per lead from the action list", async () => {
    getCampaigns.mockResolvedValue([
      { id: "c1", name: "Verano", status: "ACTIVE", objective: "OUTCOME_LEADS", created_time: ago(9), updated_time: ago(1) },
    ]);
    getCampaignInsightsMap.mockResolvedValue({
      c1: {
        impressions: "1000",
        clicks: "50",
        spend: "1000",
        reach: "900",
        cpc: "20",
        cpm: "1",
        ctr: "5",
        actions: [
          { action_type: "lead", value: "10" },
          { action_type: "purchase", value: "2" },
        ],
      },
    });

    const result = await marketing.execute({ action: "ads" }, fakeCtx);

    expect(result.campaigns?.[0].leads).toBe(10);
    expect(result.campaigns?.[0].purchases).toBe(2);
    expect(result.campaigns?.[0].costPerLead).toBe(100);
    expect(result.adsTotals?.costPerLead).toBe(100);
    expect(result.adsTotals?.activeCampaigns).toBe(1);
  });

  // A cost per lead of zero reads as free. Nothing converted is not free.
  it("leaves cost per lead unset when nothing converted", async () => {
    getCampaigns.mockResolvedValue([
      { id: "c1", name: "Verano", status: "PAUSED", objective: "OUTCOME_TRAFFIC", created_time: ago(9), updated_time: ago(1) },
    ]);
    getCampaignInsightsMap.mockResolvedValue({
      c1: { impressions: "10", clicks: "0", spend: "500", reach: "10", cpc: "0", cpm: "1", ctr: "0" },
    });

    const result = await marketing.execute({ action: "ads" }, fakeCtx);

    expect(result.campaigns?.[0].costPerLead).toBeUndefined();
    expect(result.adsTotals?.spend).toBe(500);
  });

  it("defaults the window to last_30d, as the Ads screen does", async () => {
    await marketing.execute({ action: "ads" }, fakeCtx);

    expect(getCampaignInsightsMap).toHaveBeenCalledWith("last_30d");
  });

  // A partial response is still a lead, so `started` counts everyone.
  it("separates started from completed on a form", async () => {
    listFormResponses.mockResolvedValue([
      response({ id: "a", partial: false, temperature: "hot", score: 9 }),
      response({ id: "b", partial: true, temperature: "cold", score: 1, contactId: "ct-1" }),
    ]);

    const result = await marketing.execute({ action: "forms" }, fakeCtx);
    const row = result.forms?.[0];

    expect(row?.started).toBe(2);
    expect(row?.completed).toBe(1);
    expect(row?.completionRate).toBe(0.5);
    expect(row?.identified).toBe(1);
    expect(row?.hot).toBe(1);
    expect(row?.cold).toBe(1);
    expect(row?.averageScore).toBe(5);
    expect(row?.url).toBe("/f/presupuesto");
  });

  it("reports a form nobody has filled in without inventing a rate", async () => {
    listFormResponses.mockResolvedValue([]);

    const row = (await marketing.execute({ action: "forms" }, fakeCtx)).forms?.[0];

    expect(row?.started).toBe(0);
    expect(row?.completionRate).toBeUndefined();
    expect(row?.averageScore).toBeUndefined();
  });

  it("joins source to contacts, deals and money won", async () => {
    listContacts.mockResolvedValue([
      contact({ id: "ct-1", source: "meta" }),
      contact({ id: "ct-2", source: "meta" }),
      contact({ id: "ct-3", source: "form:presupuesto" }),
    ]);
    listDeals.mockResolvedValue([
      deal({ id: "d1", contactId: "ct-1", stage: "won", value: 3000, source: undefined }),
      deal({ id: "d2", contactId: "ct-2", stage: "lost", value: 900, source: undefined }),
      deal({ id: "d3", contactId: "ct-3", stage: "won", value: 500, source: undefined }),
    ]);

    const result = await marketing.execute({ action: "funnel" }, fakeCtx);
    const meta = result.sources?.find((row) => row.source === "meta");

    expect(meta).toMatchObject({ contacts: 2, deals: 2, won: 1, lost: 1, wonValue: 3000 });
    // Sorted by money won, so the source that pays comes first.
    expect(result.sources?.[0].source).toBe("meta");
  });

  // A deal with its own source wins over the contact's: that is the field the
  // operator set deliberately.
  it("prefers the deal's own source over the contact's", async () => {
    listContacts.mockResolvedValue([contact({ id: "ct-1", source: "web" })]);
    listDeals.mockResolvedValue([deal({ contactId: "ct-1", source: "meta", stage: "won", value: 100 })]);

    const result = await marketing.execute({ action: "funnel" }, fakeCtx);

    expect(result.sources?.find((row) => row.source === "meta")?.wonValue).toBe(100);
    expect(result.sources?.find((row) => row.source === "web")?.deals).toBe(0);
  });
});
