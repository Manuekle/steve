import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
  Agent,
  AgentStatus,
  Automation,
  ChannelId,
  ChatSummary,
  Contact,
  ContactStatus,
  LeadInput,
  Reminder,
  ReminderStatus,
} from "./types";

// Shared by the Eve agent (tools/hooks/schedules) and Next.js API routes.
// Same-host deploy: both processes read ~/.steve/business.json.

const STORE_FILE = join(homedir(), ".steve", "business.json");

type BusinessStore = {
  automations: Automation[];
  contacts: Contact[];
  chats: ChatSummary[];
  reminders: Reminder[];
  agents: Agent[];
};

function emptyStore(): BusinessStore {
  return { automations: [], contacts: [], chats: [], reminders: [], agents: [] };
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<BusinessStore> {
  try {
    const raw = await readFile(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BusinessStore>;
    return {
      automations: parsed.automations ?? [],
      contacts: parsed.contacts ?? [],
      chats: parsed.chats ?? [],
      reminders: parsed.reminders ?? [],
      agents: parsed.agents ?? [],
    };
  } catch {
    return emptyStore();
  }
}

function readStoreSync(): BusinessStore {
  try {
    if (!existsSync(STORE_FILE)) return emptyStore();
    const parsed = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Partial<BusinessStore>;
    return {
      automations: parsed.automations ?? [],
      contacts: parsed.contacts ?? [],
      chats: parsed.chats ?? [],
      reminders: parsed.reminders ?? [],
      agents: parsed.agents ?? [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: BusinessStore): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf-8");
  await rename(tmp, STORE_FILE);
}

async function updateStore<T>(fn: (store: BusinessStore) => T): Promise<T> {
  return enqueue(async () => {
    const store = await readStore();
    const result = fn(store);
    await writeStore(store);
    return result;
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.replace(/[\s()-]/g, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

// ── Automations ────────────────────────────────────────────────────

export async function listAutomations(): Promise<Automation[]> {
  return (await readStore()).automations;
}

export function listAutomationsSync(): Automation[] {
  return readStoreSync().automations;
}

export async function createAutomation(
  input: Omit<Automation, "id" | "status" | "responseCount" | "createdAt">,
): Promise<Automation[]> {
  return updateStore((store) => {
    const created: Automation = {
      ...input,
      id: newId("auto"),
      status: "draft",
      responseCount: 0,
      createdAt: nowIso(),
      steps: input.steps ?? [],
    };
    store.automations = [created, ...store.automations];
    return store.automations;
  });
}

export async function updateAutomation(
  id: string,
  updates: Partial<Omit<Automation, "id">>,
): Promise<Automation[]> {
  return updateStore((store) => {
    store.automations = store.automations.map((a) =>
      a.id === id ? { ...a, ...updates } : a,
    );
    return store.automations;
  });
}

export async function deleteAutomation(id: string): Promise<Automation[]> {
  return updateStore((store) => {
    store.automations = store.automations.filter((a) => a.id !== id);
    return store.automations;
  });
}

export async function recordAutomationFire(id: string): Promise<void> {
  await updateStore((store) => {
    store.automations = store.automations.map((a) =>
      a.id === id
        ? { ...a, responseCount: a.responseCount + 1, lastTriggeredAt: nowIso() }
        : a,
    );
  });
}

// ── Contacts ───────────────────────────────────────────────────────

export async function listContacts(): Promise<Contact[]> {
  return (await readStore()).contacts;
}

export function listContactsSync(): Contact[] {
  return readStoreSync().contacts;
}

export async function getContactBySession(sessionId: string): Promise<Contact | undefined> {
  return (await readStore()).contacts.find((c) => c.sessionId === sessionId);
}

export async function getContactByPhone(phone: string): Promise<Contact | undefined> {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;
  return (await readStore()).contacts.find((c) => normalizePhone(c.phone) === normalized);
}

export async function upsertContact(
  input: Partial<Contact> & { sessionId?: string; phone?: string; email?: string },
): Promise<Contact> {
  return updateStore((store) => {
    const phone = normalizePhone(input.phone);
    const existing = store.contacts.find((c) => {
      if (input.id && c.id === input.id) return true;
      if (input.sessionId && c.sessionId === input.sessionId) return true;
      if (phone && normalizePhone(c.phone) === phone) return true;
      if (input.externalId && c.externalId === input.externalId) return true;
      if (input.email && c.email && c.email.toLowerCase() === input.email.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (existing) {
      const next: Contact = {
        ...existing,
        name: input.name ?? existing.name,
        phone: phone ?? existing.phone,
        email: input.email ?? existing.email,
        externalId: input.externalId ?? existing.externalId,
        channel: input.channel ?? existing.channel,
        sessionId: input.sessionId ?? existing.sessionId,
        crmId: input.crmId ?? existing.crmId,
        status: input.status ?? existing.status,
        source: input.source ?? existing.source,
        attributes: { ...existing.attributes, ...input.attributes },
        lastMessage: input.lastMessage ?? existing.lastMessage,
        lastMessageAt: input.lastMessageAt ?? existing.lastMessageAt,
        notes: input.notes ?? existing.notes,
      };
      store.contacts = store.contacts.map((c) => (c.id === existing.id ? next : c));
      return next;
    }

    const created: Contact = {
      id: newId("ct"),
      name: input.name ?? phone ?? input.email ?? "Unknown",
      phone,
      email: input.email,
      externalId: input.externalId,
      channel: input.channel ?? "web",
      sessionId: input.sessionId,
      crmId: input.crmId,
      status: input.status ?? "open",
      source: input.source ?? "chat",
      attributes: input.attributes ?? {},
      lastMessage: input.lastMessage,
      lastMessageAt: input.lastMessageAt ?? nowIso(),
      createdAt: nowIso(),
      notes: input.notes,
    };
    store.contacts = [created, ...store.contacts];
    return created;
  });
}

export async function setContactStatus(id: string, status: ContactStatus): Promise<Contact[]> {
  return updateStore((store) => {
    store.contacts = store.contacts.map((c) => (c.id === id ? { ...c, status } : c));
    return store.contacts;
  });
}

export async function ingestLead(lead: LeadInput): Promise<Contact> {
  const name = lead.name?.trim() || lead.phone || lead.email || "Lead";
  return upsertContact({
    name,
    phone: lead.phone,
    email: lead.email,
    channel: lead.channel ?? "form",
    source: lead.source ?? "webhook",
    lastMessage: lead.message,
    attributes: lead.attributes ?? {},
    status: "open",
  });
}

// ── Chats ──────────────────────────────────────────────────────────

export async function listChats(): Promise<ChatSummary[]> {
  return (await readStore()).chats;
}

export async function upsertChat(chat: Omit<ChatSummary, "id"> & { id?: string }): Promise<ChatSummary[]> {
  return updateStore((store) => {
    const existing = store.chats.find(
      (c) =>
        (chat.id && c.id === chat.id) ||
        (chat.sessionId && c.sessionId === chat.sessionId),
    );
    if (existing) {
      const next: ChatSummary = { ...existing, ...chat, id: existing.id };
      store.chats = store.chats.map((c) => (c.id === existing.id ? next : c));
      return store.chats;
    }
    const created: ChatSummary = { ...chat, id: chat.id ?? newId("conv") };
    store.chats = [created, ...store.chats];
    return store.chats;
  });
}

/** A chat row can be addressed by either id. The browser store mints its own
 *  `conv-<timestamp>` ids and `mergeChats` keeps those when a session exists in
 *  both stores, so the id the UI holds is often not the one this store minted.
 *  The Eve session id is the only key both sides agree on. */
function isChat(chat: ChatSummary, key: string): boolean {
  return chat.id === key || chat.sessionId === key;
}

export async function deleteChat(key: string): Promise<ChatSummary[]> {
  return updateStore((store) => {
    store.chats = store.chats.filter((c) => !isChat(c, key));
    return store.chats;
  });
}

export async function deleteContact(contactId: string): Promise<Contact[]> {
  return updateStore((store) => {
    store.contacts = store.contacts.filter((c) => c.id !== contactId);
    return store.contacts;
  });
}

export async function toggleChatPin(key: string): Promise<ChatSummary[]> {
  return updateStore((store) => {
    store.chats = store.chats.map((c) =>
      isChat(c, key) ? { ...c, pinned: !c.pinned } : c,
    );
    return store.chats;
  });
}

export function channelFromKind(kind: string | undefined): ChannelId {
  if (kind === "whatsapp") return "whatsapp";
  if (kind === "messenger") return "messenger";
  if (kind === "instagram") return "instagram";
  return "web";
}

// ── Reminders ─────────────────────────────────────────────────────

export function listReminders(contactId?: string): Reminder[] {
  const store = readStoreSync();
  if (contactId) {
    return store.reminders.filter((r) => r.contact_id === contactId);
  }
  return store.reminders;
}

export function listRemindersSync(): Reminder[] {
  return readStoreSync().reminders;
}

export function createReminder(input: {
  contact_id: string;
  datetime: string;
  message: string;
  status: ReminderStatus;
}): Reminder {
  const store = readStoreSync();
  const reminder: Reminder = {
    id: newId("rem"),
    contact_id: input.contact_id,
    datetime: input.datetime,
    message: input.message,
    status: input.status,
    created_at: nowIso(),
  };
  store.reminders = [reminder, ...store.reminders];
  writeStore(store);
  return reminder;
}

export function updateReminder(id: string, updates: Partial<Omit<Reminder, "id" | "created_at">>): Reminder | undefined {
  const store = readStoreSync();
  const existing = store.reminders.find((r) => r.id === id);
  if (!existing) return undefined;
  const updated: Reminder = { ...existing, ...updates };
  store.reminders = store.reminders.map((r) => (r.id === id ? updated : r));
  writeStore(store);
  return updated;
}

export function deleteReminder(id: string): boolean {
  const store = readStoreSync();
  const initialLength = store.reminders.length;
  store.reminders = store.reminders.filter((r) => r.id !== id);
  writeStore(store);
  return store.reminders.length < initialLength;
}

// ── Agents ──────────────────────────────────────────────────────

export async function listAgents(): Promise<Agent[]> {
  return (await readStore()).agents;
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  return (await readStore()).agents.find((a) => a.id === id);
}

export async function createAgent(
  input: Omit<Agent, "id" | "createdAt" | "status">,
): Promise<Agent> {
  return updateStore((store) => {
    const created: Agent = {
      ...input,
      id: newId("agent"),
      status: "active",
      createdAt: nowIso(),
    };
    store.agents = [created, ...store.agents];
    return created;
  });
}

export async function updateAgent(
  id: string,
  updates: Partial<Omit<Agent, "id" | "createdAt">>,
): Promise<Agent | undefined> {
  return updateStore((store) => {
    const existing = store.agents.find((a) => a.id === id);
    if (!existing) return undefined;
    const updated: Agent = { ...existing, ...updates };
    store.agents = store.agents.map((a) => (a.id === id ? updated : a));
    return updated;
  });
}

export async function deleteAgent(id: string): Promise<boolean> {
  return updateStore((store) => {
    const initial = store.agents.length;
    store.agents = store.agents.filter((a) => a.id !== id);
    return store.agents.length < initial;
  });
}

export async function toggleAgentStatus(id: string): Promise<Agent | undefined> {
  return updateStore((store) => {
    const existing = store.agents.find((a) => a.id === id);
    if (!existing) return undefined;
    const nextStatus: AgentStatus = existing.status === "active" ? "inactive" : "active";
    const updated: Agent = { ...existing, status: nextStatus };
    store.agents = store.agents.map((a) => (a.id === id ? updated : a));
    return updated;
  });
}
