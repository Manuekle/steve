import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Everything the app knows about the business it works for, in two layers:
 *
 * - `identity` is what the owner typed in themselves — name, website, contact
 *   details, logo, terms and privacy pages. Authoritative, edited by hand, and
 *   the thing the owner comes back to *read*.
 * - `record` is the AI-generated summary of that same business, synthesized
 *   from the website, Maps listing, notes and uploaded documents. Convenient,
 *   re-generatable, and never the source of truth for a legal or contact fact.
 *
 * Same shape and directory as `onboarding/store.ts` and `business-store.ts`:
 * one JSON file, written through a temp file and a rename. Logo bytes sit
 * beside it in ~/.steve/business/ — a JSON store is the wrong place for an
 * image, and the file name carries a fresh id per upload so a replaced logo
 * never shows through a cached URL.
 */

const FILE = join(homedir(), ".steve", "business-profile.json");
const BLOB_DIR = join(homedir(), ".steve", "business");

export type BusinessProfile = {
  readonly name: string;
  readonly industry: string;
  readonly description: string;
  readonly services: readonly string[];
  readonly location: string | null;
  readonly hours: string | null;
  readonly tone: string;
  readonly highlights: readonly string[];
  readonly faqs: readonly { readonly question: string; readonly answer: string }[];
};

export type BusinessProfileRecord = {
  readonly profile: BusinessProfile;
  readonly sources: {
    readonly websiteUrl?: string;
    readonly mapsUrl?: string;
    /** Set when the website was given but couldn't be read — the profile was
     *  still generated from whatever else was on hand. */
    readonly websiteError?: string;
    readonly mapsError?: string;
    readonly documentsUsed: number;
  };
  readonly generatedAt: string;
  /** Set once the owner has hand-corrected a field, so the UI can say the
   *  profile is no longer purely what the model wrote. */
  readonly editedAt?: string;
};

export type BusinessLogo = {
  /** Basename inside BLOB_DIR. Never a path — joined here, never by callers. */
  readonly file: string;
  readonly mime: string;
  readonly size: number;
  readonly updatedAt: string;
};

/** Which legal page: the two every small business is asked for. */
export type LegalPageKind = "terms" | "privacy";

export type LegalPage = {
  /** Public URL, when the page lives on the owner's site. */
  readonly url: string;
  /** The page's text, pasted or imported from `url`. What the agent answers
   *  policy questions from. */
  readonly text: string;
  /** Knowledge-base document this text was indexed as, when indexing worked.
   *  Kept so a re-save replaces that document instead of piling up copies. */
  readonly documentId: string | null;
  readonly updatedAt: string;
};

export type BusinessIdentity = {
  readonly name: string;
  /** One line: what the business does. The owner's own words. */
  readonly description: string;
  readonly websiteUrl: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly hours: string;
  readonly logo: BusinessLogo | null;
  readonly terms: LegalPage | null;
  readonly privacy: LegalPage | null;
  readonly updatedAt: string | null;
};

/** The editable text fields of `BusinessIdentity` — everything but the logo,
 *  the legal pages, and the timestamp, each of which has its own entry point. */
export type BusinessIdentityFields = Pick<
  BusinessIdentity,
  "name" | "description" | "websiteUrl" | "email" | "phone" | "address" | "hours"
>;

type Store = { record: BusinessProfileRecord | null; identity: BusinessIdentity };

export function emptyIdentity(): BusinessIdentity {
  return {
    name: "",
    description: "",
    websiteUrl: "",
    email: "",
    phone: "",
    address: "",
    hours: "",
    logo: null,
    terms: null,
    privacy: null,
    updatedAt: null,
  };
}

function empty(): Store {
  return { record: null, identity: emptyIdentity() };
}

/** Fills in every identity field, so a store written before identity existed
 *  reads back as a complete object instead of a pile of `undefined`s. */
function normalizeIdentity(parsed: Partial<BusinessIdentity> | undefined): BusinessIdentity {
  return { ...emptyIdentity(), ...(parsed ?? {}) };
}

let writeQueue: Promise<void> = Promise.resolve();

// Serializes read-modify-write cycles the same way media-store does: saving
// the identity form while a logo upload lands would otherwise have the second
// write drop the first one's change.
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function read(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf-8")) as Partial<Store>;
    return { record: parsed.record ?? null, identity: normalizeIdentity(parsed.identity) };
  } catch {
    return empty();
  }
}

async function write(store: Store): Promise<void> {
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf-8");
  await rename(tmp, FILE);
}

async function mutate<T>(fn: (store: Store) => Promise<T> | T): Promise<T> {
  return enqueue(async () => {
    const store = await read();
    const result = await fn(store);
    await write(store);
    return result;
  });
}

export async function getBusinessProfile(): Promise<BusinessProfileRecord | null> {
  return (await read()).record;
}

export async function saveBusinessProfile(record: BusinessProfileRecord): Promise<void> {
  await mutate((store) => {
    store.record = record;
  });
}

/**
 * Hand-corrects fields of the generated profile. Returns the updated record,
 * or `null` when there is no profile to correct — re-analysing is the way to
 * create one, this only edits.
 */
export async function updateBusinessProfile(
  patch: Partial<BusinessProfile>,
): Promise<BusinessProfileRecord | null> {
  return mutate((store) => {
    if (!store.record) return null;
    const updated: BusinessProfileRecord = {
      ...store.record,
      profile: { ...store.record.profile, ...patch },
      editedAt: new Date().toISOString(),
    };
    store.record = updated;
    return updated;
  });
}

/** Drops the AI summary. The hand-entered identity is deliberately untouched:
 *  they are separate things the owner deletes separately. */
export async function clearBusinessProfile(): Promise<void> {
  await mutate((store) => {
    store.record = null;
  });
}

export async function getBusinessIdentity(): Promise<BusinessIdentity> {
  return (await read()).identity;
}

export async function saveBusinessIdentity(
  patch: Partial<BusinessIdentityFields>,
): Promise<BusinessIdentity> {
  return mutate((store) => {
    const updated: BusinessIdentity = {
      ...store.identity,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    store.identity = updated;
    return updated;
  });
}

export async function setLegalPage(kind: LegalPageKind, page: LegalPage | null): Promise<BusinessIdentity> {
  return mutate((store) => {
    const updated: BusinessIdentity = {
      ...store.identity,
      [kind]: page,
      updatedAt: new Date().toISOString(),
    };
    store.identity = updated;
    return updated;
  });
}

/**
 * Writes the logo bytes and points the identity at them. The previous file is
 * removed after the pointer moves, so a crash in between leaves an orphan
 * rather than a broken image.
 */
export async function saveBusinessLogo(input: {
  bytes: Uint8Array;
  mime: string;
  extension: string;
}): Promise<BusinessLogo> {
  const file = `logo-${randomUUID()}${input.extension}`;
  await mkdir(BLOB_DIR, { recursive: true });
  await writeFile(join(BLOB_DIR, file), input.bytes);

  return mutate(async (store) => {
    const previous = store.identity.logo;
    const logo: BusinessLogo = {
      file,
      mime: input.mime,
      size: input.bytes.byteLength,
      updatedAt: new Date().toISOString(),
    };
    store.identity = { ...store.identity, logo, updatedAt: logo.updatedAt };
    if (previous && previous.file !== file) {
      await rm(join(BLOB_DIR, previous.file), { force: true });
    }
    return logo;
  });
}

export async function readBusinessLogo(): Promise<{ bytes: Uint8Array; logo: BusinessLogo } | null> {
  const { identity } = await read();
  if (!identity.logo) return null;
  try {
    const bytes = new Uint8Array(await readFile(join(BLOB_DIR, identity.logo.file)));
    return { bytes, logo: identity.logo };
  } catch {
    // The pointer outlived the file — a wiped ~/.steve/business, a restore
    // from a JSON-only backup. Report "no logo" rather than a broken read.
    return null;
  }
}

export async function deleteBusinessLogo(): Promise<void> {
  const removed = await mutate((store) => {
    const previous = store.identity.logo;
    store.identity = { ...store.identity, logo: null, updatedAt: new Date().toISOString() };
    return previous;
  });
  if (removed) await rm(join(BLOB_DIR, removed.file), { force: true });
}

/** Deletes logo files no longer pointed at — the orphans a crashed replace
 *  can leave behind. Safe to call at any time; never throws. */
export async function pruneBusinessLogos(): Promise<void> {
  try {
    const { identity } = await read();
    const keep = identity.logo?.file;
    for (const name of await readdir(BLOB_DIR)) {
      if (name.startsWith("logo-") && name !== keep) {
        await rm(join(BLOB_DIR, name), { force: true });
      }
    }
  } catch {
    /* nothing to prune */
  }
}
