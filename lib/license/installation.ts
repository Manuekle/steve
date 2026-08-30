import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// This machine's own identity, for binding a license to one installation.
//
// Not a hardware fingerprint — those break across VM migrations, container
// rebuilds, and disk clones, none of which should invalidate a license. A
// random id generated once on first run and persisted to disk is what
// actually stays stable across all of that, at the cost of surviving a
// deliberate reinstall — which is the right cost: this identifies an
// installation, not a piece of silicon.
//
// Generated lazily, not at some "setup" step — the id has to exist before
// anyone has bought anything, so it can be shown in Settings and sent to
// Steve as part of asking for a license in the first place.

const FILE = join(homedir(), ".steve", "installation-id");

let cached: string | null = null;

function generate(): string {
  return randomUUID();
}

export function getInstallationIdSync(): string {
  if (cached) return cached;
  try {
    if (existsSync(FILE)) {
      cached = readFileSync(FILE, "utf-8").trim();
      if (cached) return cached;
    }
  } catch {
    // Fall through to generating a fresh one.
  }
  cached = generate();
  return cached;
}

export async function getInstallationId(): Promise<string> {
  try {
    const existing = (await readFile(FILE, "utf-8")).trim();
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // No file yet — generate and persist below.
  }

  const id = cached ?? generate();
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, `${id}\n`, "utf-8");
  await rename(tmp, FILE);
  cached = id;
  return id;
}
