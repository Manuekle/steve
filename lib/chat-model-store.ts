import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "./doc-store";

// Per-conversation model choice.
//
// Eve resolves the model inside its own process, from a resolver that only
// knows the session id — it cannot see the browser. So the picker writes its
// choice here and the resolver reads it back: a ~/.steve file handoff between
// the two processes, or a Postgres document where there is no shared disk.
//
// A brand-new chat has no session id until its first turn is under way, which
// is exactly when the model is needed. `pending` covers that gap: the picker
// parks the choice, the first turn claims it, and the claim is written back
// under the real session id so later turns in that chat stay on it.
//
// The claim is the awkward part: Eve's model resolver is synchronous, and
// Postgres cannot be read or written that way. In DB mode the sync path is
// served from a cache that every async read fills, and the claim it makes is
// applied to that cache immediately and persisted in the background. The
// consequence is bounded and already the documented behaviour of this store:
// a claim that does not land in time means the next turn re-claims the same
// value. Nothing else in the app reads it.

const STORE_FILE = join(homedir(), ".steve", "chat-models.json");

type ChatModelStore = {
  /** sessionId → model id. */
  bySession: Record<string, string>;
  /** Choice waiting for the next session that has none. */
  pending?: string;
};

function empty(): ChatModelStore {
  return { bySession: {} };
}

function normalize(parsed: Partial<ChatModelStore>): ChatModelStore {
  return { bySession: parsed.bySession ?? {}, pending: parsed.pending };
}

const chatModelStore = createDocumentStore<ChatModelStore>({
  id: "chat-models",
  file: STORE_FILE,
  empty,
  normalize,
});

/** What the sync path sees. Filled by every async read; in file mode it is
 *  also refreshed straight from disk, which is cheaper than a round trip and
 *  picks up the other process's writes. */
let cache: ChatModelStore | null = null;
/** True once an async read resolved to Postgres: a file left over from before
 *  the move is stale, and must not win over the cache. */
let cacheFromDb = false;

function readSync(): ChatModelStore {
  if (!cacheFromDb) {
    try {
      if (existsSync(STORE_FILE)) {
        return normalize(JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Partial<ChatModelStore>);
      }
    } catch {
      // Fall through to the cache.
    }
  }
  return cache ?? empty();
}

async function read(): Promise<ChatModelStore> {
  const store = await chatModelStore.read();
  cache = store;
  cacheFromDb = await chatModelStore.usingDatabase();
  return store;
}

/** Record a choice. Without a session id it parks as `pending`. */
export async function setChatModel(model: string, sessionId?: string): Promise<void> {
  cache = await chatModelStore.update((store) => {
    if (sessionId) {
      store.bySession[sessionId] = model;
      // The pending slot has done its job once a session owns the choice.
      if (store.pending === model) delete store.pending;
    } else {
      store.pending = model;
    }
    return store;
  });
}

/** Forget a session's choice (used when a chat is cleared). */
export async function clearChatModel(sessionId: string): Promise<void> {
  cache = await chatModelStore.update((store) => {
    delete store.bySession[sessionId];
    return store;
  });
}

export async function getChatModel(sessionId: string): Promise<string | undefined> {
  return (await read()).bySession[sessionId];
}

export async function getPendingChatModel(): Promise<string | undefined> {
  return (await read()).pending;
}

/**
 * The model for a session, claiming the pending choice when the session has
 * none yet. Synchronous because Eve's model resolver is.
 *
 * The claim is applied to the cache before returning, so the rest of this
 * turn agrees with itself, and persisted in the background. A persist that
 * does not land means the next turn re-claims the same value — the same
 * consequence the synchronous file write always had on failure.
 */
export function claimChatModelSync(sessionId: string): string | undefined {
  const store = readSync();
  const existing = store.bySession[sessionId];
  if (existing) return existing;

  const pending = store.pending;
  if (!pending) return undefined;

  store.bySession[sessionId] = pending;
  delete store.pending;
  cache = store;

  void chatModelStore
    .update((persisted) => {
      persisted.bySession[sessionId] = pending;
      if (persisted.pending === pending) delete persisted.pending;
    })
    .catch(() => undefined);

  return pending;
}

/** Fill the sync cache from the active backend. Needed only in DB mode, and
 *  only before the first async read — see `claimChatModelSync`. */
export async function warmChatModelCache(): Promise<void> {
  await read();
}
