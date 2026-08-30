import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Setup: point store to a temp dir ──────────────────────────────

const TEST_DIR = join(tmpdir(), `steve-test-${Date.now()}`);
const TEST_FILE = join(TEST_DIR, "business.json");

// We need to set HOME so the business-store reads from our test dir.
// business-store uses homedir() → ~/.steve/business.json.
// We mock homedir() to return our test dir.
import { vi } from "vitest";

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => TEST_DIR,
  };
});

// Must import AFTER mock
const {
  createAutomation,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  upsertContact,
  listContacts,
  getContactBySession,
  setContactStatus,
  deleteContact,
  upsertChat,
  listChats,
  deleteChat,
  toggleChatPin,
  channelFromKind,
} = await import("./business-store");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ── Automations ──────────────────────────────────────────────────

describe("business-store: automations", () => {
  it("starts with empty list", async () => {
    const list = await listAutomations();
    expect(list).toEqual([]);
  });

  it("creates an automation", async () => {
    const list = await createAutomation({
      name: "Welcome",
      description: "Test",
      trigger: "new_chat",
      triggerValue: "",
      channel: "all",
      steps: [],
    });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Welcome");
    expect(list[0].status).toBe("draft");
    expect(list[0].id).toMatch(/^auto-/);
  });

  it("updates an automation", async () => {
    const list = await createAutomation({
      name: "Test",
      description: "",
      trigger: "keyword",
      triggerValue: "hi",
      channel: "web",
    });
    const id = list[0].id;
    const updated = await updateAutomation(id, { name: "Updated", status: "active" });
    expect(updated.find((a) => a.id === id)?.name).toBe("Updated");
    expect(updated.find((a) => a.id === id)?.status).toBe("active");
  });

  it("deletes an automation", async () => {
    await createAutomation({ name: "To Delete", description: "", trigger: "keyword", triggerValue: "", channel: "all" });
    let list = await listAutomations();
    expect(list).toHaveLength(1);
    await deleteAutomation(list[0].id);
    list = await listAutomations();
    expect(list).toHaveLength(0);
  });
});

// ── Contacts ─────────────────────────────────────────────────────

describe("business-store: contacts", () => {
  it("starts with empty list", async () => {
    const list = await listContacts();
    expect(list).toEqual([]);
  });

  it("creates a contact", async () => {
    const contact = await upsertContact({
      name: "Juan",
      phone: "+54111234",
      channel: "whatsapp",
      source: "webhook",
    });
    expect(contact.name).toBe("Juan");
    expect(contact.phone).toBe("+54111234");
    expect(contact.id).toMatch(/^ct-/);
  });

  it("upserts by phone (no duplicate)", async () => {
    await upsertContact({ name: "Juan", phone: "+54111234", channel: "whatsapp" });
    const contact = await upsertContact({ name: "Juan Updated", phone: "+54111234", channel: "whatsapp" });
    const list = await listContacts();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Juan Updated");
  });

  it("upserts by sessionId", async () => {
    await upsertContact({ name: "A", sessionId: "sess-1", channel: "web" });
    await upsertContact({ name: "B", sessionId: "sess-1", channel: "web" });
    const list = await listContacts();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("B");
  });

  it("finds contact by session", async () => {
    await upsertContact({ name: "FindMe", sessionId: "sess-42", channel: "web" });
    const found = await getContactBySession("sess-42");
    expect(found?.name).toBe("FindMe");
  });

  it("sets contact status", async () => {
    const created = await upsertContact({ name: "Status", channel: "web" });
    await setContactStatus(created.id, "waiting_human");
    const list = await listContacts();
    expect(list[0].status).toBe("waiting_human");
  });

  it("deletes a contact", async () => {
    const created = await upsertContact({ name: "Delete Me", channel: "web" });
    await deleteContact(created.id);
    const list = await listContacts();
    expect(list).toHaveLength(0);
  });

  it("merges attributes on upsert", async () => {
    await upsertContact({ name: "Attr", phone: "+5499999", channel: "web", attributes: { a: "1" } });
    const updated = await upsertContact({ name: "Attr", phone: "+5499999", channel: "web", attributes: { b: "2" } });
    expect(updated.attributes).toEqual({ a: "1", b: "2" });
  });
});

// ── Chats ────────────────────────────────────────────────────────

describe("business-store: chats", () => {
  it("starts with empty list", async () => {
    const list = await listChats();
    expect(list).toEqual([]);
  });

  it("creates a chat", async () => {
    const list = await upsertChat({
      title: "Test Chat",
      channel: "web",
      lastMessage: "Hello",
      lastMessageAt: new Date().toISOString(),
      messageCount: 1,
    });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Test Chat");
    expect(list[0].id).toMatch(/^conv-/);
  });

  it("upserts by sessionId (no duplicate)", async () => {
    await upsertChat({ title: "A", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0, sessionId: "s1" });
    await upsertChat({ title: "B", channel: "web", lastMessage: "Hi", lastMessageAt: "", messageCount: 1, sessionId: "s1" });
    const list = await listChats();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("B");
    expect(list[0].lastMessage).toBe("Hi");
  });

  it("deletes a chat", async () => {
    const list = await upsertChat({ title: "Del", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0 });
    await deleteChat(list[0].id);
    const chats = await listChats();
    expect(chats).toHaveLength(0);
  });

  // The browser store mints its own ids, so the id the UI holds for a chat that
  // exists in both stores is usually not the one this store minted. The session
  // id is the only key both sides share.
  it("deletes a chat by its session id", async () => {
    await upsertChat({ title: "Del", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0, sessionId: "wrun_1" });
    await deleteChat("wrun_1");
    expect(await listChats()).toHaveLength(0);
  });

  it("pins a chat by its session id", async () => {
    await upsertChat({ title: "Pin", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0, sessionId: "wrun_2" });
    const pinned = await toggleChatPin("wrun_2");
    expect(pinned[0].pinned).toBe(true);
  });

  it("toggles pin", async () => {
    const list = await upsertChat({ title: "Pin", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0 });
    expect(list[0].pinned).toBeFalsy();
    const pinned = await toggleChatPin(list[0].id);
    expect(pinned[0].pinned).toBe(true);
    const unpinned = await toggleChatPin(list[0].id);
    expect(unpinned[0].pinned).toBe(false);
  });
});

// ── channelFromKind ──────────────────────────────────────────────

describe("channelFromKind", () => {
  it("maps whatsapp", () => expect(channelFromKind("whatsapp")).toBe("whatsapp"));
  it("maps messenger", () => expect(channelFromKind("messenger")).toBe("messenger"));
  it("defaults to web", () => expect(channelFromKind("web")).toBe("web"));
  it("defaults to web for unknown", () => expect(channelFromKind("telegram")).toBe("web"));
  it("defaults to web for undefined", () => expect(channelFromKind(undefined)).toBe("web"));
});
