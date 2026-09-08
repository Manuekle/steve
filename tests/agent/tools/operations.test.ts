import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "eve/tools";
import type { Automation, Contact, Reminder } from "../../../lib/types";

const getContactBySession = vi.fn();
const listAutomations = vi.fn();
const listContacts = vi.fn();
const listReminders = vi.fn();
const getConnectionSummaries = vi.fn();
const getUsageSummary = vi.fn();
const getInstallationId = vi.fn();

vi.mock("../../../lib/business-store", () => ({
  getContactBySession: (...a: unknown[]) => getContactBySession(...(a as [])),
  listAutomations: (...a: unknown[]) => listAutomations(...(a as [])),
  listContacts: (...a: unknown[]) => listContacts(...(a as [])),
  listReminders: (...a: unknown[]) => listReminders(...(a as [])),
}));
vi.mock("../../../lib/connection-store", () => ({
  getConnectionSummaries: (...a: unknown[]) => getConnectionSummaries(...(a as [])),
}));
vi.mock("../../../lib/usage-report", () => ({
  getUsageSummary: (...a: unknown[]) => getUsageSummary(...(a as [])),
}));
vi.mock("../../../lib/license/installation", () => ({
  getInstallationId: (...a: unknown[]) => getInstallationId(...(a as [])),
}));
vi.mock("../../../lib/agent-scope", () => ({ assertToolAllowed: async () => undefined }));

const operations = (await import("../../../agent/tools/operations")).default;

const fakeCtx = { session: { id: "s-1" } } as unknown as ToolContext;
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const ahead = (d: number) => new Date(Date.now() + d * DAY).toISOString();

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

function automation(over: Partial<Automation> = {}): Automation {
  return {
    id: "au-1",
    name: "Bienvenida",
    description: "",
    trigger: "new_chat",
    triggerValue: "",
    channel: "all",
    status: "active",
    responseCount: 12,
    createdAt: ago(60),
    lastTriggeredAt: ago(2),
    steps: [{ id: "s1", type: "message", config: {} }],
    ...over,
  } as Automation;
}

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "rm-1",
    contact_id: "ct-1",
    datetime: ahead(1),
    message: "llamar",
    status: "pending",
    created_at: ago(1),
    ...over,
  };
}

const EMPTY_USAGE = {
  totalCredits: 0,
  totalProviderCost: 0,
  includedCost: 0,
  byokEstimatedCost: 0,
  byProvider: [],
  byAgent: [],
  byChannel: [],
  byDay: [],
};

beforeEach(() => {
  getContactBySession.mockReset().mockResolvedValue(contact());
  listAutomations.mockReset().mockResolvedValue([automation()]);
  listContacts.mockReset().mockResolvedValue([contact()]);
  listReminders.mockReset().mockResolvedValue([reminder()]);
  getConnectionSummaries.mockReset().mockResolvedValue({ oauth: [], manual: [] });
  getUsageSummary.mockReset().mockResolvedValue(EMPTY_USAGE);
  getInstallationId.mockReset().mockResolvedValue("inst-1");
});

describe("operations", () => {
  it.each(["whatsapp", "instagram", "form", "voice"] as const)(
    "refuses off the owner's console (%s)",
    async (channel) => {
      getContactBySession.mockResolvedValue(contact({ channel }));

      const result = await operations.execute({ action: "automations" }, fakeCtx);

      expect(result.ok).toBe(false);
      expect(listAutomations).not.toHaveBeenCalled();
    },
  );

  // Switched on and never matched is the silently-broken case this exists for.
  it("counts active automations that have never fired", async () => {
    listAutomations.mockResolvedValue([
      automation({ id: "a", status: "active", lastTriggeredAt: undefined, responseCount: 0 }),
      automation({ id: "b", status: "active" }),
      automation({ id: "c", status: "draft", lastTriggeredAt: undefined }),
      automation({ id: "d", status: "paused" }),
    ]);

    const result = await operations.execute({ action: "automations" }, fakeCtx);

    expect(result.automationTotals).toMatchObject({
      total: 4,
      active: 2,
      draft: 1,
      paused: 1,
      activeNeverFired: 1,
    });
    expect(result.automations?.find((row) => row.id === "a")?.neverFired).toBe(true);
    expect(result.automations?.find((row) => row.id === "b")?.lastFiredDaysAgo).toBe(2);
  });

  it("flags whether a playbook can hand off to a person", async () => {
    listAutomations.mockResolvedValue([
      automation({ id: "a", steps: [{ id: "s1", type: "message", config: {} }] } as Partial<Automation>),
      automation({
        id: "b",
        steps: [
          { id: "s1", type: "message", config: {} },
          { id: "s2", type: "transfer_human", config: {} },
        ],
      } as Partial<Automation>),
    ]);

    const result = await operations.execute({ action: "automations" }, fakeCtx);

    expect(result.automations?.find((row) => row.id === "a")?.endsInHandoff).toBe(false);
    expect(result.automations?.find((row) => row.id === "b")?.endsInHandoff).toBe(true);
  });

  // Statuses and names only. A masked key preview is still something a model
  // can repeat into a chat.
  it("returns connection status without any credential preview", async () => {
    getConnectionSummaries.mockResolvedValue({
      oauth: [
        {
          id: "google",
          label: "Google",
          status: "needs_reconnect",
          accountLabel: "ana@negocio.com",
          connectedAt: ago(90),
          descriptionKey: "d",
          unlockKeys: [],
          appDocsUrl: "",
          scopeCount: 3,
          oauthAppKeys: ["A", "B"],
        },
      ],
      manual: [
        {
          id: "stripe",
          label: "Stripe",
          configured: true,
          keyPreview: "sk-live-…wXyz",
          descriptionKey: "d",
          reasonKey: "r",
          settingsGroup: "g",
          credentialKeys: ["STRIPE_SECRET_KEY"],
        },
      ],
    });

    const result = await operations.execute({ action: "connections" }, fakeCtx);

    expect(result.connections).toHaveLength(2);
    expect(result.connections?.[0]).toMatchObject({
      id: "google",
      status: "needs_reconnect",
      account: "ana@negocio.com",
    });
    expect(JSON.stringify(result)).not.toContain("wXyz");
    expect(JSON.stringify(result)).not.toContain("STRIPE_SECRET_KEY");
  });

  it("totals AI usage over the current period by default", async () => {
    getUsageSummary.mockResolvedValue({
      ...EMPTY_USAGE,
      totalCredits: 1234.567,
      totalProviderCost: 1.2345,
      byProvider: [{ provider: "anthropic", credits: 1000, providerCost: 1, calls: 40 }],
      byAgent: [{ agentId: null, credits: 234.5, providerCost: 0.2, calls: 10 }],
      byChannel: [{ channel: "whatsapp", credits: 900, providerCost: 0.9, calls: 30 }],
      byDay: [{ day: "2026-09-01", credits: 100, providerCost: 0.1, calls: 5 }],
    });

    const result = await operations.execute({ action: "usage" }, fakeCtx);

    expect(getUsageSummary).toHaveBeenCalledWith("inst-1", { since: undefined });
    expect(result.usage?.credits).toBe(1234.57);
    // A call this app could not attribute is not an agent named "null".
    expect(result.usage?.byAgent[0].agent).toBe("(sin agente atribuido)");
    expect(result.usage?.byChannel[0].channel).toBe("whatsapp");
  });

  it("narrows the usage window when days is given", async () => {
    await operations.execute({ action: "usage", days: 7 }, fakeCtx);

    const [, range] = getUsageSummary.mock.calls[0];
    expect(range.since).toBeInstanceOf(Date);
  });

  it("counts what is waiting on a person, and how long", async () => {
    listContacts.mockResolvedValue([
      contact({ id: "a", status: "waiting_human", lastMessageAt: ago(5) }),
      contact({ id: "b", status: "waiting_human", lastMessageAt: ago(1) }),
      contact({ id: "c", status: "followup_due" }),
      contact({ id: "d", status: "open" }),
    ]);
    listReminders.mockResolvedValue([
      reminder({ id: "r1", datetime: ago(2), status: "pending" }),
      reminder({ id: "r2", datetime: ahead(3), status: "pending" }),
      reminder({ id: "r3", status: "failed" }),
      reminder({ id: "r4", status: "sent" }),
    ]);

    const result = await operations.execute({ action: "queue" }, fakeCtx);

    expect(result.queue).toMatchObject({
      waitingForHuman: 2,
      followupDue: 1,
      openContacts: 1,
      remindersPending: 2,
      remindersOverdue: 1,
      remindersFailed: 1,
      oldestWaitDays: 5,
    });
  });

  it("leaves the oldest wait unset when nobody is waiting", async () => {
    listContacts.mockResolvedValue([contact({ status: "open" })]);

    const result = await operations.execute({ action: "queue" }, fakeCtx);

    expect(result.queue?.waitingForHuman).toBe(0);
    expect(result.queue?.oldestWaitDays).toBeUndefined();
  });
});
