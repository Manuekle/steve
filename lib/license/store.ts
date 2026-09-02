import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "../doc-store";
import { deriveLicenseInfo } from "./verify";
import { getInstallationId } from "./installation";
import type { LicenseInfo } from "./types";

// Where a self-hosted install keeps its Enterprise license token.
//
// Same shape as lib/credentials.ts: a single file under ~/.steve, written
// through a temp file and a rename so a crash mid-write can't corrupt it,
// with an env var fallback (STEVE_LICENSE_KEY) for deployments that inject
// config through their process manager instead of the Settings UI.

const LICENSE_FILE = join(homedir(), ".steve", "license.json");

type LicenseStore = { token: string | null };

// Postgres when one is configured, ~/.steve/license.json otherwise. The old
// plain-text ~/.steve/license.key is still read once, below, so an install
// that predates this keeps its license without anyone re-pasting it.
const licenseStore = createDocumentStore<LicenseStore>({
  id: "license",
  file: LICENSE_FILE,
  empty: () => ({ token: null }),
  normalize: (parsed) => ({ token: parsed.token ?? null }),
  fileMode: 0o600,
});

const LEGACY_FILE = join(homedir(), ".steve", "license.key");

async function readToken(): Promise<string | null> {
  const stored = (await licenseStore.read()).token;
  if (stored) return stored;
  try {
    const legacy = (await readFile(LEGACY_FILE, "utf-8")).trim();
    return legacy || null;
  } catch {
    return null;
  }
}

export async function getLicenseToken(): Promise<string | undefined> {
  const stored = await readToken();
  return stored ?? process.env.STEVE_LICENSE_KEY ?? undefined;
}

/** Verifies before persisting — an invalid token never overwrites a working one. */
export async function saveLicenseToken(
  token: string,
): Promise<{ ok: true; info: LicenseInfo } | { ok: false; info: LicenseInfo }> {
  const info = deriveLicenseInfo(token, await getInstallationId());
  if (info.status !== "valid") return { ok: false, info };

  await licenseStore.update((store) => {
    store.token = token.trim();
  });
  return { ok: true, info };
}

export async function getCurrentLicenseInfo(): Promise<LicenseInfo> {
  const [token, installationId] = await Promise.all([getLicenseToken(), getInstallationId()]);
  return deriveLicenseInfo(token, installationId);
}
