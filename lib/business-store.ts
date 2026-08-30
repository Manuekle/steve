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
  Form,
  FormResponse,
  LeadInput,
  Reminder,
  ReminderStatus,
  VoiceCall,
  VoiceCallSource,
  VoiceCallTurn,
} from "./types";
import { moveContactTo } from "./contact-order";

// Shared by the Eve agent (tools/hooks/schedules) and Next.js API routes.
// Same-host deploy: both processes read ~/.steve/business.json.

const STORE_FILE = join(homedir(), ".steve", "business.json");

type BusinessStore = {
  automations: Automation[];
  contacts: Contact[];
  chats: ChatSummary[];
  reminders: Reminder[];
  agents: Agent[];
  forms: Form[];
  formResponses: FormResponse[];
  voiceCalls: VoiceCall[];
};

function emptyStore(): BusinessStore {
  return {
    automations: [],
    contacts: [],
    chats: [],
    reminders: [],
    agents: [],
    forms: [],
    formResponses: [],
    voiceCalls: [],
  };
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
      forms: parsed.forms ?? [],
      formResponses: parsed.formResponses ?? [],
      voiceCalls: parsed.voiceCalls ?? [],
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
      forms: parsed.forms ?? [],
      formResponses: parsed.formResponses ?? [],
      voiceCalls: parsed.voiceCalls ?? [],
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

/**
 * Status change plus placement: the CRM board lets a card be dropped between
 * two others, and the slot it lands in is the order it keeps. Order lives in
 * the contacts array itself — see `moveContactTo`.
 */
export async function moveContact(
  id: string,
  status: ContactStatus,
  index?: number,
): Promise<Contact[]> {
  return updateStore((store) => {
    store.contacts = moveContactTo(store.contacts, id, status, index);
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

/** Looks an agent up by its ElevenLabs mirror id — what a post-call webhook
 *  carries, never this app's own agent id. */
export async function getAgentByElevenLabsAgentId(
  elevenlabsAgentId: string,
): Promise<Agent | undefined> {
  return (await readStore()).agents.find(
    (a) => a.voice?.elevenlabsAgentId === elevenlabsAgentId,
  );
}

// ── Voice calls ──────────────────────────────────────────────────────
//
// Every call an agent's ElevenLabs mirror handles — the test button on this
// app and real inbound calls both land here. `startVoiceCall` runs the
// instant this app itself places or opens a call, before there is any
// transcript to show, purely to stamp `source: "test"` on the record ahead
// of the webhook. `recordVoiceCallTranscript` is the post_call_transcription
// webhook filling that record in (or creating it fresh, tagged "real", when
// no such pending row exists — the only way a call reaches this handler
// without this app having placed it first).

export async function listVoiceCalls(agentId: string): Promise<VoiceCall[]> {
  const calls = (await readStore()).voiceCalls.filter((c) => c.agentId === agentId);
  return calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function startVoiceCall(input: {
  agentId: string;
  conversationId: string;
  source: VoiceCallSource;
}): Promise<VoiceCall> {
  return updateStore((store) => {
    const existing = store.voiceCalls.find((c) => c.conversationId === input.conversationId);
    if (existing) return existing;
    const created: VoiceCall = {
      id: newId("call"),
      agentId: input.agentId,
      conversationId: input.conversationId,
      source: input.source,
      transcript: [],
      startedAt: nowIso(),
      createdAt: nowIso(),
    };
    store.voiceCalls = [created, ...store.voiceCalls];
    return created;
  });
}

export async function recordVoiceCallTranscript(input: {
  agentId: string;
  conversationId: string;
  transcript: readonly VoiceCallTurn[];
  durationSecs?: number;
  startedAt?: string;
}): Promise<VoiceCall> {
  return updateStore((store) => {
    const existing = store.voiceCalls.find((c) => c.conversationId === input.conversationId);
    if (existing) {
      const updated: VoiceCall = {
        ...existing,
        transcript: input.transcript,
        durationSecs: input.durationSecs ?? existing.durationSecs,
        startedAt: input.startedAt ?? existing.startedAt,
      };
      store.voiceCalls = store.voiceCalls.map((c) =>
        c.conversationId === input.conversationId ? updated : c,
      );
      return updated;
    }
    // No pending row — this app never placed this call, so it is a real
    // inbound call reaching the agent's routed number.
    const created: VoiceCall = {
      id: newId("call"),
      agentId: input.agentId,
      conversationId: input.conversationId,
      source: "real",
      transcript: input.transcript,
      durationSecs: input.durationSecs,
      startedAt: input.startedAt ?? nowIso(),
      createdAt: nowIso(),
    };
    store.voiceCalls = [created, ...store.voiceCalls];
    return created;
  });
}

// ── Forms ──────────────────────────────────────────────────────────
//
// Forms and their responses live in this file rather than in one of their own
// because `readStore` rebuilds the whole object from a fixed key set: a second
// module writing the same JSON would drop whatever it did not know about. One
// owner per file.

/** A slug that reads like the form's name and is safe in a URL. Falls back to
 *  the id's suffix when a name has nothing a URL can carry (an emoji, CJK). */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "form";
}

/** `slugify`, then `-2`, `-3`… until nothing else claims it. */
function uniqueSlug(forms: readonly Form[], name: string, ignoreId?: string): string {
  const taken = new Set(forms.filter((f) => f.id !== ignoreId).map((f) => f.slug));
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listForms(): Promise<Form[]> {
  return (await readStore()).forms;
}

export function listFormsSync(): Form[] {
  return readStoreSync().forms;
}

export async function getForm(id: string): Promise<Form | undefined> {
  return (await readStore()).forms.find((f) => f.id === id);
}

/** How the public page finds a form. Draft forms resolve too — the caller
 *  decides what an unpublished form looks like to a visitor. */
export async function getFormBySlug(slug: string): Promise<Form | undefined> {
  return (await readStore()).forms.find((f) => f.slug === slug);
}

export async function createForm(
  input: Pick<Form, "name" | "description" | "steps" | "scoring"> & Partial<Pick<Form, "thankYou" | "status" | "slug">>,
): Promise<Form> {
  return updateStore((store) => {
    const now = nowIso();
    const created: Form = {
      id: newId("fm"),
      slug: uniqueSlug(store.forms, input.slug ?? input.name),
      name: input.name,
      description: input.description,
      // Published on creation: a form nobody can open is not a first win, and
      // the list screen has a switch for turning it off.
      status: input.status ?? "published",
      steps: input.steps,
      scoring: input.scoring,
      thankYou: input.thankYou,
      createdAt: now,
      updatedAt: now,
    };
    store.forms = [created, ...store.forms];
    return created;
  });
}

export async function updateForm(
  id: string,
  updates: Partial<Omit<Form, "id" | "createdAt">>,
): Promise<Form | undefined> {
  return updateStore((store) => {
    const existing = store.forms.find((f) => f.id === id);
    if (!existing) return undefined;
    // A rename does not move the URL: links already handed out keep working.
    // Changing the slug is its own edit, and it is checked for collisions.
    const slug = updates.slug ? uniqueSlug(store.forms, updates.slug, id) : existing.slug;
    const updated: Form = { ...existing, ...updates, slug, updatedAt: nowIso() };
    store.forms = store.forms.map((f) => (f.id === id ? updated : f));
    return updated;
  });
}

export async function deleteForm(id: string): Promise<boolean> {
  return updateStore((store) => {
    const initial = store.forms.length;
    store.forms = store.forms.filter((f) => f.id !== id);
    // Responses go with it. Keeping orphans would leave the responses screen
    // counting answers to questions nobody can read any more.
    store.formResponses = store.formResponses.filter((r) => r.formId !== id);
    return store.forms.length < initial;
  });
}

export async function listFormResponses(formId?: string): Promise<FormResponse[]> {
  const responses = (await readStore()).formResponses;
  return formId ? responses.filter((r) => r.formId === formId) : responses;
}

export async function getFormResponse(id: string): Promise<FormResponse | undefined> {
  return (await readStore()).formResponses.find((r) => r.id === id);
}

/**
 * Create or replace a response. The public page writes on every step, so the
 * same response is updated several times: whoever left after question two is
 * already stored when they close the tab, which is the whole point of counting
 * partial submissions as leads.
 */
export async function saveFormResponse(
  input: Omit<FormResponse, "id" | "startedAt" | "updatedAt"> & { id?: string },
): Promise<FormResponse> {
  return updateStore((store) => {
    const now = nowIso();
    const existing = input.id ? store.formResponses.find((r) => r.id === input.id) : undefined;
    if (existing) {
      const updated: FormResponse = {
        ...existing,
        answers: input.answers,
        score: input.score,
        temperature: input.temperature,
        partial: input.partial,
        contactId: input.contactId ?? existing.contactId,
        updatedAt: now,
      };
      store.formResponses = store.formResponses.map((r) => (r.id === existing.id ? updated : r));
      return updated;
    }
    const created: FormResponse = {
      ...input,
      id: input.id ?? newId("fr"),
      startedAt: now,
      updatedAt: now,
    };
    store.formResponses = [created, ...store.formResponses];
    return created;
  });
}
