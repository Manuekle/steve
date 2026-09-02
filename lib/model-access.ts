import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "./doc-store";

// Which models this account is actually allowed to call.
//
// A key can be valid, the balance can be positive, and a model can still be
// refused — Vercel's free Gateway credits, for instance, only reach part of
// the catalog ("Free tier users do not have access to this model"). Being
// listed in the catalog is not the same as being callable, and the difference
// only shows up when a real request is made.
//
// The probe in Settings records what it learns here, so the task defaults and
// the picker can route around models this account cannot use instead of
// discovering it again on the user's next message.

const STORE_FILE = join(homedir(), ".steve", "model-access.json");

export type ModelAccessStore = {
  /** model id → why it was refused, in the provider's own words. */
  restricted: Record<string, string>;
  checkedAt?: string;
};

function empty(): ModelAccessStore {
  return { restricted: {} };
}

function normalize(parsed: Partial<ModelAccessStore>): ModelAccessStore {
  return { restricted: parsed.restricted ?? {}, checkedAt: parsed.checkedAt };
}

// Postgres when one is configured, ~/.steve/model-access.json otherwise.
const accessStore = createDocumentStore<ModelAccessStore>({
  id: "model-access",
  file: STORE_FILE,
  empty,
  normalize,
});

export async function readAccess(): Promise<ModelAccessStore> {
  return accessStore.read();
}

/** Replace what we know. The probe always reports on the same set of models,
 *  so a full replace is right: a model that stops being refused should stop
 *  being marked, not linger from an older run. */
export async function writeAccess(restricted: Record<string, string>): Promise<void> {
  await accessStore.update((store) => {
    store.restricted = restricted;
    store.checkedAt = new Date().toISOString();
  });
}

