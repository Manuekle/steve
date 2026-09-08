import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "eve/tools";
import type { ChannelConversation, Contact } from "../../../lib/types";

const getContactBySession = vi.fn();
const listContacts = vi.fn();
const listChannelConversations = vi.fn();

vi.mock("../../../lib/business-store", () => ({
  getContactBySession: (...args: unknown[]) => getContactBySession(...(args as [])),
  listContacts: (...args: unknown[]) => listContacts(...(args as [])),
  listChannelConversations: (...args: unknown[]) => listChannelConversations(...(args as [])),
}));
vi.mock("../../../lib/agent-scope", () => ({
  assertToolAllowed: async () => undefined,
}));

const inbox = (await import("../../../agent/tools/inbox")).default;

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

function conversation(over: Partial<ChannelConversation> = {}): ChannelConversation {
  return {
    id: "cv-1",
    sessionId: "s-9",
    channel: "whatsapp",
    contactId: "ct-1",
    title: "Marta",
    turns: [
      { role: "user", content: "hola, cuánto sale el envío a Córdoba" },
      { role: "assistant", content: "el envío sale 4000" },
    ],
    startedAt: ago(3),
    updatedAt: ago(2),
    prospect: {
      stage: "negotiating",
      reason: "Pidió precio y quedó pendiente",
      assessedAt: ago(2),
      turnCount: 2,
      source: "ai",
    },
    ...over,
  };
}

beforeEach(() => {
  getContactBySession.mockReset().mockResolvedValue(contact());
  listContacts.mockReset().mockResolvedValue([contact()]);
  listChannelConversations.mockReset().mockResolvedValue([conversation()]);
});

describe("inbox", () => {
  it.each(["whatsapp", "instagram", "form", "voice"] as const)(
    "refuses off the owner's console (%s)",
    async (channel) => {
      getContactBySession.mockResolvedValue(contact({ channel }));

      const result = await inbox.execute({ action: "list" }, fakeCtx);

      expect(result.ok).toBe(false);
      expect(result.conversations).toBeUndefined();
      expect(listChannelConversations).not.toHaveBeenCalled();
    },
  );

  // The list is the queue, not the archive of what was said. A hundred
  // transcripts would bury the answer in the question.
  it("lists outcomes without any transcript", async () => {
    const result = await inbox.execute({ action: "list" }, fakeCtx);

    expect(result.conversations?.[0]).toMatchObject({
      contact: "Marta",
      outcome: "negotiating",
      turns: 2,
    });
    expect(JSON.stringify(result)).not.toContain("cuánto sale");
  });

  it("filters the list by outcome and drops the unassessed", async () => {
    listChannelConversations.mockResolvedValue([
      conversation({ id: "a", title: "Sin evaluar", prospect: undefined }),
      conversation({ id: "b", title: "Marta" }),
    ]);

    const result = await inbox.execute({ action: "list", outcome: ["negotiating"] }, fakeCtx);

    expect(result.conversations?.map((row) => row.contact)).toEqual(["Marta"]);
  });

  // An unassessed conversation is usually too short to judge — reporting it as
  // unqualified would be the classifier saying something it never said.
  it("can list only the unassessed", async () => {
    listChannelConversations.mockResolvedValue([
      conversation({ id: "a", title: "Sin evaluar", prospect: undefined }),
      conversation({ id: "b", title: "Marta" }),
    ]);

    const result = await inbox.execute({ action: "list", unassessedOnly: true }, fakeCtx);

    expect(result.conversations?.map((row) => row.contact)).toEqual(["Sin evaluar"]);
  });

  it("marks who is still waiting on a person", async () => {
    listContacts.mockResolvedValue([contact({ status: "waiting_human" })]);

    const result = await inbox.execute({ action: "list" }, fakeCtx);

    expect(result.conversations?.[0].waitingForHuman).toBe(true);
  });

  it("opens one thread with its messages", async () => {
    const result = await inbox.execute({ action: "thread", contact: "marta" }, fakeCtx);

    expect(result.thread?.contact).toBe("Marta");
    expect(result.thread?.turns).toHaveLength(2);
    expect(result.thread?.turns[0].content).toContain("cuánto sale");
    expect(result.thread?.totalTurns).toBe(2);
  });

  // Two people called Ana is the normal case. Reading the wrong one aloud is
  // worse than one extra question.
  it("asks which when the name is ambiguous instead of picking one", async () => {
    listChannelConversations.mockResolvedValue([
      conversation({ id: "a", title: "Ana Pérez" }),
      conversation({ id: "b", title: "Ana Gómez" }),
    ]);

    const result = await inbox.execute({ action: "thread", contact: "ana" }, fakeCtx);

    expect(result.ok).toBe(false);
    expect(result.thread).toBeUndefined();
    expect(result.candidates).toHaveLength(2);
  });

  it("says so when no conversation matches the name", async () => {
    const result = await inbox.execute({ action: "thread", contact: "nadie" }, fakeCtx);

    expect(result.ok).toBe(false);
    expect(result.thread).toBeUndefined();
  });

  it("returns the matching lines for a search, not the whole thread", async () => {
    const result = await inbox.execute({ action: "search", query: "envío" }, fakeCtx);

    expect(result.totalMatched).toBe(1);
    expect(result.matches?.[0].contact).toBe("Marta");
    expect(result.matches?.[0].snippets).toHaveLength(2);
    expect(result.matches?.[0].snippets[0].text).toContain("envío");
  });

  it("returns nothing for a term nobody used", async () => {
    const result = await inbox.execute({ action: "search", query: "reembolso" }, fakeCtx);

    expect(result.ok).toBe(true);
    expect(result.totalMatched).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it("refuses a search with no term rather than returning everything", async () => {
    const result = await inbox.execute({ action: "search", query: "   " }, fakeCtx);

    expect(result.ok).toBe(false);
    expect(result.matches).toBeUndefined();
  });

  it("reports the full match count when the limit cuts the list", async () => {
    listChannelConversations.mockResolvedValue([
      conversation({ id: "a", title: "A" }),
      conversation({ id: "b", title: "B" }),
      conversation({ id: "c", title: "C" }),
    ]);

    const result = await inbox.execute({ action: "list", limit: 1 }, fakeCtx);

    expect(result.conversations).toHaveLength(1);
    expect(result.totalMatched).toBe(3);
  });

  it("filters by channel", async () => {
    listChannelConversations.mockResolvedValue([
      conversation({ id: "a", title: "Web", channel: "web" }),
      conversation({ id: "b", title: "Wpp", channel: "whatsapp" }),
    ]);

    const result = await inbox.execute({ action: "list", channel: "whatsapp" }, fakeCtx);

    expect(result.conversations?.map((row) => row.contact)).toEqual(["Wpp"]);
  });
});
