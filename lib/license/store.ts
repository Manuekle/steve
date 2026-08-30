import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { deriveLicenseInfo } from "./verify";
import { getInstallationId } from "./installation";
import type { LicenseInfo } from "./types";

// Where a self-hosted install keeps its Enterprise license token.
//
// Same shape as lib/credentials.ts: a single file under ~/.steve, written
// through a temp file and a rename so a crash mid-write can't corrupt it,
// with an env var fallback (STEVE_LICENSE_KEY) for deployments that inject
// config through their process manager instead of the Settings UI.

const LICENSE_FILE = join(homedir(), ".steve", "license.key");

let cachedToken: string | null | undefined; // undefined = not loaded yet

function loadCacheSync(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = existsSync(LICENSE_FILE) ? readFileSync(LICENSE_FILE, "utf-8").trim() : null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

async function readToken(): Promise<string | null> {
  try {
    return (await readFile(LICENSE_FILE, "utf-8")).trim();
  } catch {
    return null;
  }
}

/** Synchronous read for code that can't await — falls back to the env var. */
export function getLicenseTokenSync(): string | undefined {
  return loadCacheSync() ?? process.env.STEVE_LICENSE_KEY ?? undefined;
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

  await mkdir(dirname(LICENSE_FILE), { recursive: true });
  const tmp = `${LICENSE_FILE}.tmp`;
  await writeFile(tmp, `${token.trim()}\n`, "utf-8");
  await rename(tmp, LICENSE_FILE);
  cachedToken = token.trim();
  return { ok: true, info };
}

export async function getCurrentLicenseInfo(): Promise<LicenseInfo> {
  const [token, installationId] = await Promise.all([getLicenseToken(), getInstallationId()]);
  return deriveLicenseInfo(token, installationId);
}
