import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * What the deal routes refuse, and what the store owns rather than the caller.
 * `closedAt` is the interesting one: it is stamped by the stage, not sent, so
 * a deal that closes, gets edited and then reopens has to end up with no
 * closing date rather than a stale one.
 */

const TEST_DIR = join(tmpdir(), `senka-deals-route-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const listRoute = await import("@/app/api/deals/route");
const dealRoute = await import("@/app/api/deals/[id]/route");
const { upsertContact, listDeals, deleteContact, createReminder, listReminders } = await import(
  "@/lib/business-store"
);

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function json(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type AnyRequest = Parameters<typeof listRoute.POST>[0];

async function seedContact() {
  return upsertContact({ name: "Ana", phone: "+5491111111111", source: "whatsapp" });
}

async function create(body: Record<string, unknown>) {
  return listRoute.POST(json("http://localhost/api/deals", "POST", body) as AnyRequest);
}

async function patch(id: string, body: Record<string, unknown>) {
  return dealRoute.PATCH(json(`http://localhost/api/deals/${id}`, "PATCH", body) as AnyRequest, {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/deals", () => {
  it("creates a deal and inherits the contact's source", async () => {
    const contact = await seedContact();
    const response = await create({
      contactId: contact.id,
      title: "  Store redesign  ",
      value: "1500.499",
      currency: "usd",
    });

    expect(response.status).toBe(200);
    const { deal } = await response.json();
    expect(deal.title).toBe("Store redesign");
    expect(deal.currency).toBe("USD");
    // Rounded to cents rather than stored as typed.
    expect(deal.value).toBe(1500.5);
    expect(deal.stage).toBe("lead");
    expect(deal.source).toBe("whatsapp");
    expect(deal.closedAt).toBeUndefined();
  });

  it("refuses a deal against a contact that doesn't exist", async () => {
    const response = await create({ contactId: "ct-nobody", title: "X", currency: "USD" });
    expect(response.status).toBe(404);
    expect(await listDeals()).toHaveLength(0);
  });

  it("refuses a value or a currency the pipeline can't render", async () => {
    const contact = await seedContact();
    for (const body of [
      { value: "not a number" },
      { value: -5 },
      { currency: "PESOS" },
      { currency: "" },
      { stage: "someday" },
      { expectedCloseAt: "the 4th of never" },
    ]) {
      const response = await create({
        contactId: contact.id,
        title: "X",
        currency: "USD",
        ...body,
      });
      expect(response.status).toBe(400);
    }
    expect(await listDeals()).toHaveLength(0);
  });

  it("wants a title", async () => {
    const contact = await seedContact();
    const response = await create({ contactId: contact.id, title: "   ", currency: "USD" });
    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/deals/[id]", () => {
  it("stamps closedAt when a deal is won, and clears it when it reopens", async () => {
    const contact = await seedContact();
    const { deal } = await (await create({
      contactId: contact.id,
      title: "Job",
      value: 100,
      currency: "USD",
    })).json();

    const won = await (await patch(deal.id, { stage: "won" })).json();
    expect(won.deal.closedAt).toBeTruthy();

    // An edit to an already-closed deal keeps the original closing date.
    const edited = await (await patch(deal.id, { title: "Job (final)" })).json();
    expect(edited.deal.closedAt).toBe(won.deal.closedAt);

    const reopened = await (await patch(deal.id, { stage: "negotiation" })).json();
    expect(reopened.deal.closedAt).toBeUndefined();
  });

  it("drops the lost reason when a deal stops being lost", async () => {
    const contact = await seedContact();
    const { deal } = await (await create({
      contactId: contact.id,
      title: "Job",
      currency: "USD",
    })).json();

    const lost = await (await patch(deal.id, { stage: "lost", lostReason: "Too expensive" })).json();
    expect(lost.deal.lostReason).toBe("Too expensive");

    const back = await (await patch(deal.id, { stage: "proposal" })).json();
    expect(back.deal.lostReason).toBeUndefined();
  });

  it("ignores fields no screen owns", async () => {
    const contact = await seedContact();
    const other = await upsertContact({ name: "Beto" });
    const { deal } = await (await create({
      contactId: contact.id,
      title: "Job",
      currency: "USD",
    })).json();

    const response = await patch(deal.id, {
      title: "Renamed",
      contactId: other.id,
      createdAt: "1999-01-01T00:00:00.000Z",
      closedAt: "1999-01-01T00:00:00.000Z",
    });

    const updated = (await response.json()).deal;
    expect(updated.title).toBe("Renamed");
    expect(updated.contactId).toBe(contact.id);
    expect(updated.createdAt).toBe(deal.createdAt);
    expect(updated.closedAt).toBeUndefined();
  });

  it("clears the expected close date when sent empty", async () => {
    const contact = await seedContact();
    const { deal } = await (await create({
      contactId: contact.id,
      title: "Job",
      currency: "USD",
      expectedCloseAt: "2026-12-01",
    })).json();
    expect(deal.expectedCloseAt).toBeTruthy();

    const cleared = await (await patch(deal.id, { expectedCloseAt: "" })).json();
    expect(cleared.deal.expectedCloseAt).toBeUndefined();
  });

  it("404s on a deal that isn't there", async () => {
    expect((await patch("dl-nobody", { title: "X" })).status).toBe(404);
  });
});

describe("deleting a contact", () => {
  it("takes its deals and reminders with it", async () => {
    const contact = await seedContact();
    await create({ contactId: contact.id, title: "Job", currency: "USD" });
    await createReminder({
      contact_id: contact.id,
      datetime: "2026-12-01T10:00:00.000Z",
      message: "Follow up",
      status: "pending",
    });

    await deleteContact(contact.id);

    expect(await listDeals()).toHaveLength(0);
    expect(await listReminders()).toHaveLength(0);
  });
});
