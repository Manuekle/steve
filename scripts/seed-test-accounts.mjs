#!/usr/bin/env node
// Create the operator accounts a test install needs, against whichever backend
// this install is configured for — Postgres when WORKFLOW_POSTGRES_URL is set,
// ~/.steve/auth.json otherwise. Both go through the same `createAccount` the
// signup form uses, so the hashing and the validation are the real ones.
//
// It does not invent passwords. A password this script generated would have to
// be printed to be usable, and a credential that has been printed to a terminal
// is a credential someone else has now read. Supply them:
//
//   STEVE_SEED_ACCOUNTS="owner@example.com:the-password,ops@example.com:another-one" \
//     node scripts/seed-test-accounts.mjs
//
// Idempotent: an email that already has an account is left exactly as it is,
// password included.
//
// One thing this cannot do, and it is worth knowing before you look for it:
// there is no per-account plan. `Account` is {email, hash, salt, createdAt},
// and lib/billing-store.ts records what plan *the installation* is on. Every
// account on an install shares one plan and one licence. Two accounts on
// different tiers needs the workspace model this app does not have yet.

import { readFileSync } from "node:fs";

// Next.js loads .env for the app; a bare node script does not. Without this
// the script quietly seeds ~/.steve/auth.json on an install whose accounts
// live in Postgres — it would report success against the wrong backend, which
// is the one outcome worth engineering away. Existing environment wins, so
// `WORKFLOW_POSTGRES_URL=… node scripts/…` still points where you say.
function loadDotEnv() {
  let contents;
  try {
    contents = readFileSync(new URL("../.env", import.meta.url), "utf-8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    const value = raw.replace(/^["']|["']$/g, "");
    if (value) process.env[key] = value;
  }
}
loadDotEnv();

const { createAccount, hasAnyAccount, MIN_PASSWORD_LENGTH } = await import("../lib/auth/store.ts");

const raw = process.env.STEVE_SEED_ACCOUNTS?.trim();
if (!raw) {
  console.error(
    [
      "STEVE_SEED_ACCOUNTS is not set.",
      "",
      'Format: "email:password,email:password"  (password at least ' +
        `${MIN_PASSWORD_LENGTH} characters)`,
      "",
      "Example:",
      '  STEVE_SEED_ACCOUNTS="owner@example.com:choose-a-real-one,ops@example.com:another-real-one" \\',
      "    node scripts/seed-test-accounts.mjs",
    ].join("\n"),
  );
  process.exit(1);
}

const entries = raw.split(",").map((pair) => {
  const at = pair.indexOf(":");
  if (at === -1) {
    console.error(`Malformed entry ${JSON.stringify(pair)}: expected email:password.`);
    process.exit(1);
  }
  return { email: pair.slice(0, at).trim(), password: pair.slice(at + 1) };
});

console.log(`backend: ${process.env.WORKFLOW_POSTGRES_URL ? "postgres" : "~/.steve/auth.json"}`);
console.log(`accounts already present: ${(await hasAnyAccount()) ? "yes" : "none"}`);

let failed = 0;
for (const { email, password } of entries) {
  const result = await createAccount(email, password);
  if (result.ok) {
    console.log(`created  ${email}`);
  } else if (result.reason === "email_exists") {
    // Not a failure: running this twice should be safe, and overwriting a
    // password nobody asked to change would be worse than doing nothing.
    console.log(`exists   ${email} (left as is)`);
  } else {
    failed++;
    console.error(
      `refused  ${email} — invalid email, or password under ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

process.exit(failed === 0 ? 0 : 1);
