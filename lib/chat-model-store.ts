import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// Per-conversation model choice.
//
// Eve resolves the model inside its own process, from a resolver that only
// knows the session id — it cannot see the browser. So the picker writes its
// choice here and the resolver reads it back, the same ~/.steve file handoff
// the business store already uses between the two processes.
//
// A brand-new chat has no session id until its first turn is under way, which
// is exactly when the model is needed. `pending` covers that gap: the picker
// parks the choice, the first turn claims it, and the claim is written back
// under the real session id so later turns in that chat stay on it.

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

function readSync(): ChatModelStore {
  try {
    if (!existsSync(STORE_FILE)) return empty();
    return normalize(JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Partial<ChatModelStore>);
  } catch {
    return empty();
  }
}

async function read(): Promise<ChatModelStore> {
  try {
    return normalize(JSON.parse(await readFile(STORE_FILE, "utf-8")) as Partial<ChatModelStore>);
  } catch {
    return empty();
  }
}

async function write(store: ChatModelStore): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf-8");
  await rename(tmp, STORE_FILE);
}

function writeSync(store: ChatModelStore): void {
  // The resolver runs inside Eve's synchronous model-selection path, so the
  // claim it makes has to land before the call goes out.
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", "utf-8");
  renameSync(tmp, STORE_FILE);
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

/** Record a choice. Without a session id it parks as `pending`. */
export async function setChatModel(model: string, sessionId?: string): Promise<void> {
  await enqueue(async () => {
    const store = await read();
    if (sessionId) {
      store.bySession[sessionId] = model;
      // The pending slot has done its job once a session owns the choice.
      if (store.pending === model) delete store.pending;
    } else {
      store.pending = model;
    }
    await write(store);
  });
}

/** Forget a session's choice (used when a chat is cleared). */
export async function clearChatModel(sessionId: string): Promise<void> {
  await enqueue(async () => {
    const store = await read();
    if (!(sessionId in store.bySession)) return;
    delete store.bySession[sessionId];
    await write(store);
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
 */
export function claimChatModelSync(sessionId: string): string | undefined {
  const store = readSync();
  const existing = store.bySession[sessionId];
  if (existing) return existing;

  const pending = store.pending;
  if (!pending) return undefined;

  store.bySession[sessionId] = pending;
  delete store.pending;
  try {
    writeSync(store);
  } catch {
    // Losing the write only means the next turn re-claims the same value.
  }
  return pending;
}
