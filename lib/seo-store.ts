import { join } from "node:path";
import { homedir } from "node:os";
import { nanoid } from "nanoid";
import { createDocumentStore } from "./doc-store";

// What this install has done to its own site, and which property it watches.
//
// Search Console will tell you that clicks doubled. It will never tell you
// why, because it does not know that the titles were rewritten on the 4th and
// a hundred pages of thin content were merged on the 11th. That context lives
// nowhere but in the head of whoever did the work, and a fortnight later it is
// gone — which is how a team ends up unable to say whether the thing they did
// worked.
//
// So the panel keeps a log. A change is a date and a sentence; the chart marks
// it, and the traffic either side of it is read off the series already on
// screen. No extra API call, and no claim of causation beyond what a marker on
// a line implies — the operator is the one who knows whether the two are
// related, and this only makes it possible to ask.
//
// Scoped to the business: two shops on one install have two sites, two
// properties and two sets of changes.

const STORE_FILE = join(homedir(), ".steve", "seo.json");

export type SeoChange = {
  readonly id: string;
  /** `YYYY-MM-DD`, the day the change went live — not the day it was logged.
   *  Backdating a change from last week is the normal case. */
  readonly date: string;
  /** What was done. One line: "Reescritos los titles de /precios". */
  readonly note: string;
  readonly createdAt: string;
};

type SeoStore = {
  /** The Search Console property this business watches. Absent until either
   *  the operator picks one or the panel settles on a default. */
  site?: string;
  changes: SeoChange[];
};

function empty(): SeoStore {
  return { changes: [] };
}

function normalize(parsed: Partial<SeoStore>): SeoStore {
  return {
    ...(parsed.site ? { site: parsed.site } : {}),
    changes: Array.isArray(parsed.changes) ? parsed.changes : [],
  };
}

const seoStore = createDocumentStore<SeoStore>({
  id: "seo",
  file: STORE_FILE,
  empty,
  normalize,
  scoped: true,
});

export async function getSeoSite(): Promise<string | undefined> {
  return (await seoStore.read()).site;
}

export async function setSeoSite(site: string): Promise<void> {
  await seoStore.update((store) => {
    store.site = site;
  });
}

/** Newest change first, which is the order the panel lists them in and the
 *  order that survives a sort by date when two changes share a day. */
export async function listSeoChanges(): Promise<SeoChange[]> {
  const store = await seoStore.read();
  return [...store.changes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function createSeoChange(input: {
  readonly date: string;
  readonly note: string;
}): Promise<SeoChange> {
  const change: SeoChange = {
    id: nanoid(10),
    date: input.date,
    note: input.note.trim(),
    createdAt: new Date().toISOString(),
  };
  await seoStore.update((store) => {
    store.changes.push(change);
  });
  return change;
}

export async function deleteSeoChange(id: string): Promise<boolean> {
  return seoStore.update((store) => {
    const before = store.changes.length;
    store.changes = store.changes.filter((change) => change.id !== id);
    return store.changes.length < before;
  });
}
