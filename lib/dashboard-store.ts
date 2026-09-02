import type {
  Automation,
  ChatSummary,
  ChannelInfo,
  ChannelStatus,
  DashboardStats,
  ActivityPoint,
} from "./types";

// In-browser store for dashboard metadata. Uses localStorage so data
// survives reloads. The Eve runtime owns the actual session state; this
// store layers app-level metadata (chat titles, automations, channel
// status) on top of the eve sessions.

const STORE_KEY = "steve:dashboard:v3";

type DashboardStore = {
  chats: ChatSummary[];
  automations: Automation[];
};

// ── Seed data ─────────────────────────────────────────────────────
// Empty by default — the user starts with a clean dashboard and
// populates it through real conversations and automations they create.

const SEED_CHATS: ChatSummary[] = [];
const SEED_AUTOMATIONS: Automation[] = [];

function seedStore(): DashboardStore {
  return {
    chats: SEED_CHATS,
    automations: SEED_AUTOMATIONS,
  };
}

// ── Persistence ────────────────────────────────────────────────────

function loadStore(): DashboardStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const seed = seedStore();
      saveStore(seed);
      return seed;
    }
    return JSON.parse(raw) as DashboardStore;
  } catch {
    return seedStore();
  }
}

function saveStore(store: DashboardStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Dashboard remains usable when storage is unavailable.
  }
}

// ── Public API ─────────────────────────────────────────────────────

export function getChats(): ChatSummary[] {
  return loadStore().chats;
}

export function getAutomations(): Automation[] {
  return loadStore().automations;
}

export function togglePin(chatId: string): ChatSummary[] {
  const store = loadStore();
  const chats = store.chats.map((c) =>
    c.id === chatId ? { ...c, pinned: !c.pinned } : c,
  );
  saveStore({ ...store, chats });
  return chats;
}

export function deleteChat(chatId: string): ChatSummary[] {
  const store = loadStore();
  const chats = store.chats.filter((c) => c.id !== chatId);
  saveStore({ ...store, chats });
  return chats;
}

export function toggleAutomation(id: string): Automation[] {
  const store = loadStore();
  const automations = store.automations.map((a) =>
    a.id === id
      ? { ...a, status: a.status === "active" ? ("paused" as const) : ("active" as const) }
      : a,
  );
  saveStore({ ...store, automations });
  return automations;
}

export function deleteAutomation(id: string): Automation[] {
  const store = loadStore();
  const automations = store.automations.filter((a) => a.id !== id);
  saveStore({ ...store, automations });
  return automations;
}

export function createAutomation(
  automation: Omit<Automation, "id" | "status" | "responseCount" | "createdAt">,
): Automation[] {
  const store = loadStore();
  const newAuto: Automation = {
    ...automation,
    id: `auto-${Date.now()}`,
    status: "draft",
    responseCount: 0,
    createdAt: new Date().toISOString(),
    steps: automation.steps ?? [],
  };
  saveStore({ ...store, automations: [newAuto, ...store.automations] });
  return [newAuto, ...store.automations];
}

export function updateAutomation(id: string, updates: Partial<Omit<Automation, "id">>): Automation[] {
  const store = loadStore();
  const automations = store.automations.map((a) =>
    a.id === id ? { ...a, ...updates } : a,
  );
  saveStore({ ...store, automations });
  return automations;
}

/** Save a real conversation from the Eve chat into the dashboard store. */
export function saveConversation(chat: Omit<ChatSummary, "id"> & { id?: string }): ChatSummary[] {
  const store = loadStore();
  const id = chat.id ?? `conv-${Date.now()}`;
  const existing = store.chats.find((c) => c.id === id || c.sessionId === chat.sessionId);
  let chats: ChatSummary[];
  if (existing) {
    // Update in place
    chats = store.chats.map((c) =>
      c.id === existing.id ? { ...c, ...chat, id: existing.id } : c,
    );
  } else {
    // Prepend new
    chats = [{ ...chat, id }, ...store.chats];
  }
  saveStore({ ...store, chats });
  return chats;
}

// ── Derived data ───────────────────────────────────────────────────

/**
 * Build channel info from chats + credential status.
 * `credentialStatus` maps channel ids to whether their credentials are
 * configured (from /api/channels/status). When omitted, all channels
 * default to "connected" for backwards compatibility.
 */
export function getChannels(
  chats: ChatSummary[],
  credentialStatus?: Record<string, boolean>,
): ChannelInfo[] {
  const channels: Array<{ id: string; label: string; status: ChannelStatus; messageCount: number; lastEvent: string | undefined }> = [
    { id: "web", label: "Web Chat", status: "connected", messageCount: 0, lastEvent: undefined },
    { id: "whatsapp", label: "WhatsApp", status: credentialStatus?.whatsapp ? "connected" : "disconnected", messageCount: 0, lastEvent: undefined },
    { id: "instagram", label: "Instagram", status: credentialStatus?.instagram ? "connected" : "disconnected", messageCount: 0, lastEvent: undefined },
  ];
  const byId = new Map(channels.map((c) => [c.id, c]));

  for (const chat of chats) {
    const ch = byId.get(chat.channel);
    if (ch) {
      ch.messageCount += chat.messageCount;
      if (!ch.lastEvent || chat.lastMessageAt > ch.lastEvent) {
        ch.lastEvent = chat.lastMessageAt;
      }
    }
  }

  return channels as ChannelInfo[];
}

export function getStats(chats: ChatSummary[], automations: Automation[]): DashboardStats {
  const totalChats = chats.length;
  const activeChats = chats.filter(
    (c) => Date.now() - new Date(c.lastMessageAt).getTime() < 60 * 60 * 1000,
  ).length;
  const totalMessages = chats.reduce((sum, c) => sum + c.messageCount, 0);
  const automatedReplies = automations.reduce((sum, a) => sum + a.responseCount, 0);

  const channelMap = new Map<string, number>();
  for (const chat of chats) {
    channelMap.set(chat.channel, (channelMap.get(chat.channel) ?? 0) + 1);
  }
  const channelBreakdown = [...channelMap.entries()].map(([channel, count]) => ({
    channel: channel as ChannelInfo["id"],
    count,
    percentage: totalChats > 0 ? Math.round((count / totalChats) * 100) : 0,
  }));

  return {
    totalChats,
    activeChats,
    totalMessages,
    automatedReplies,
    avgResponseTime: "—",
    channelBreakdown,
  };
}

export function mergeChats(local: ChatSummary[], server: ChatSummary[]): ChatSummary[] {
  const byKey = new Map<string, ChatSummary>();
  for (const chat of [...local, ...server]) {
    const key = chat.sessionId ?? chat.id;
    const prev = byKey.get(key);
    byKey.set(key, prev ? { ...prev, ...chat, id: prev.id } : chat);
  }
  return [...byKey.values()];
}

// Monday-first, matching the `(getDay() + 6) % 7` shift below.
const WEEKDAY_KEYS = [
  "day.mon",
  "day.tue",
  "day.wed",
  "day.thu",
  "day.fri",
  "day.sat",
  "day.sun",
];

export function getActivityData(chats: ChatSummary[] = []): ActivityPoint[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const chat of chats) {
    const date = new Date(chat.lastMessageAt);
    if (!Number.isFinite(date.getTime())) continue;
    const idx = (date.getDay() + 6) % 7;
    counts[idx] += chat.messageCount || 1;
  }
  return WEEKDAY_KEYS.map((labelKey, i) => ({ labelKey, value: counts[i] ?? 0 }));
}
