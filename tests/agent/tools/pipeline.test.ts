import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "eve/tools";
import type { Contact, Deal } from "../../../lib/types";

const getContactBySession = vi.fn();
const listContacts = vi.fn();
const listDeals = vi.fn();

vi.mock("../../../lib/business-store", () => ({
  getContactBySession: (...args: unknown[]) => getContactBySession(...(args as [])),
  listContacts: (...args: unknown[]) => listContacts(...(args as [])),
  listDeals: (...args: unknown[]) => listDeals(...(args as [])),
}));
vi.mock("../../../lib/agent-scope", () => ({
  assertToolAllowed: async () => undefined,
}));

const pipeline = (await import("../../../agent/tools/pipeline")).default;

const fakeCtx = { session: { id: "s-1" } } as unknown as ToolContext;

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

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
    stage: "proposal",
    createdAt: ago(30),
    updatedAt: ago(1),
    ...over,
  };
}

beforeEach(() => {
  getContactBySession.mockReset().mockResolvedValue(contact());
  listContacts.mockReset().mockResolvedValue([contact()]);
  listDeals.mockReset().mockResolvedValue([deal()]);
});

describe("pipeline", () => {
  // The whole point of the tool's gate: a customer on WhatsApp asking for the
  // customer list gets a refusal, not the account's CRM.
  it.each(["whatsapp", "instagram"] as const)("refuses on the %s channel", async (channel) => {
    getContactBySession.mockResolvedValue(contact({ channel }));

    const result = await pipeline.execute({ action: "contacts" }, fakeCtx);

    expect(result.ok).toBe(false);
    expect(result.contacts).toBeUndefined();
    expect(listContacts).not.toHaveBeenCalled();
  });

  // form and voice are contact origins, not the owner's console. They collapse
  // to "web" in toMessagingChannel, which is exactly why this tool does not
  // use that helper.
  it.each(["form", "voice"] as const)("refuses on the %s origin", async (channel) => {
    getContactBySession.mockResolvedValue(contact({ channel }));

    const result = await pipeline.execute({ action: "summary" }, fakeCtx);

    expect(result.ok).toBe(false);
  });

  it("refuses when the session has no contact at all", async () => {
    getContactBySession.mockResolvedValue(undefined);

    const result = await pipeline.execute({ action: "summary" }, fakeCtx);

    expect(result.ok).toBe(false);
  });

  it("summarises the board on the owner's console", async () => {
    listDeals.mockResolvedValue([
      deal({ id: "dl-1", stage: "won", value: 1000, closedAt: ago(2) }),
      deal({ id: "dl-2", stage: "lost", value: 500 }),
      deal({ id: "dl-3", stage: "proposal", value: 2000 }),
    ]);

    const result = await pipeline.execute({ action: "summary" }, fakeCtx);

    expect(result.ok).toBe(true);
    const totals = result.totals?.find((row) => row.currency === "ARS");
    expect(totals?.won).toBe(1000);
    expect(totals?.lost).toBe(500);
    expect(totals?.open).toBe(2000);
    expect(result.winRate).toBe(0.5);
    expect(result.stageCounts?.proposal).toBe(1);
  });

  it("filters deals by stage and resolves the contact's name", async () => {
    listDeals.mockResolvedValue([deal({ stage: "negotiation" }), deal({ id: "dl-2", stage: "lead" })]);

    const result = await pipeline.execute({ action: "deals", stage: ["negotiation"] }, fakeCtx);

    expect(result.deals).toHaveLength(1);
    expect(result.deals?.[0].contact).toBe("Marta");
  });

  it("keeps only stale open deals when asked", async () => {
    listDeals.mockResolvedValue([
      deal({ id: "dl-fresh", updatedAt: ago(1) }),
      deal({ id: "dl-stale", updatedAt: ago(40) }),
    ]);

    const result = await pipeline.execute({ action: "deals", onlyStale: true }, fakeCtx);

    expect(result.deals?.map((row) => row.id)).toEqual(["dl-stale"]);
  });

  // A slice reported as the whole board is how a forecast quietly loses half
  // its deals, so the caller is always told what it did not see.
  it("reports the full match count when the limit cuts the list", async () => {
    listDeals.mockResolvedValue([deal({ id: "a" }), deal({ id: "b" }), deal({ id: "c" })]);

    const result = await pipeline.execute({ action: "deals", limit: 1 }, fakeCtx);

    expect(result.deals).toHaveLength(1);
    expect(result.totalMatched).toBe(3);
  });
});
