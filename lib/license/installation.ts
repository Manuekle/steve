import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "../doc-store";

// This installation's own identity, for binding a license to one install and
// for naming the account that usage is billed to.
//
// Not a hardware fingerprint — those break across VM migrations, container
// rebuilds, and disk clones, none of which should invalidate a license. A
// random id generated once and persisted is what actually stays stable across
// all of that, at the cost of surviving a deliberate reinstall — which is the
// right cost: this identifies an installation, not a piece of silicon.
//
// Where "persisted" points matters more than it looks. On one host, a file is
// the install. On a platform that runs many instances of the same deployment,
// it is not: each instance would generate its own id, so the same deployment
// would report as a different installation from one request to the next, and
// lib/credit-account.ts would bill each of them separately. So when a database
// is configured it is the identity, and every instance reads the same row.
//
// Generated lazily, not at some "setup" step — the id has to exist before
// anyone has bought anything, so it can be shown in Settings and sent to
// Steve as part of asking for a license in the first place.

const FILE = join(homedir(), ".steve", "installation.json");

type InstallationStore = { id: string | null };

const installationStore = createDocumentStore<InstallationStore>({
  id: "installation",
  file: FILE,
  empty: () => ({ id: null }),
  normalize: (parsed) => ({ id: parsed.id ?? null }),
});

/** The plain-text file this replaced. Read once, so an install that predates
 *  the change keeps the id its license was issued against. */
const LEGACY_FILE = join(homedir(), ".steve", "installation-id");

let cached: string | null = null;

function generate(): string {
  return randomUUID();
}

async function readLegacy(): Promise<string | null> {
  try {
    return (await readFile(LEGACY_FILE, "utf-8")).trim() || null;
  } catch {
    return null;
  }
}

export async function getInstallationId(): Promise<string> {
  if (cached) return cached;

  const legacy = await readLegacy();
  // One transaction, so two instances racing on a cold start cannot each
  // generate an id and hand out different ones: the second reads what the
  // first wrote instead of overwriting it.
  const id = await installationStore.update((store) => {
    store.id ??= legacy ?? generate();
    return store.id;
  });
  cached = id;
  return id;
}
