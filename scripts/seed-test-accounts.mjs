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
// password included. Set STEVE_SEED_OVERWRITE=1 to rotate the password of an
// account that already exists — see the note above the rotate call below for
// why that is a separate opt-in and not the default.
//
// One thing this cannot do, and it is worth knowing before you look for it:
// there is no per-account plan. `Account` is {email, hash, salt, createdAt},
// and lib/billing-store.ts records what plan *the installation* is on. Every
// account on an install shares one plan and one licence. Two accounts on
// different tiers needs the workspace model this app does not have yet.

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// Node strips TypeScript types on its own now, but it does not do extension
// search for ESM: `lib/auth/store.ts` imports `"./db-store"`, and the resolver
// looks for exactly that file, finds nothing, and throws ERR_MODULE_NOT_FOUND.
// Every run of this script died there — `pnpm seed:accounts` had not worked on
// Node 24 or 26 at all, and nothing caught it because CI never invokes it.
//
// Bundlers (Next, vitest) fill the extension in, which is why the same imports
// are fine everywhere else in the app and why rewriting them here would be the
// wrong fix. This teaches the resolver the one rule it is missing, and only
// after its own attempt has already failed.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return next(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

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

const { createAccount, hasAnyAccount, resetPassword, startPasswordReset, MIN_PASSWORD_LENGTH } =
  await import("../lib/auth/store.ts");

const overwrite = process.env.STEVE_SEED_OVERWRITE === "1";

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
  } else if (result.reason === "email_exists" && overwrite) {
    // Rotation, through the store's own reset pair rather than a new
    // "set this password" export. `startPasswordReset` mints the token and
    // `resetPassword` consumes it, so this is the exact path the emailed link
    // takes — same scrypt, same validation, and it drops that account's
    // existing sessions, which is what rotating a password should do anyway.
    // Adding an admin-only setter to lib/auth/store.ts would have been a
    // function that changes any password with no proof of anything, sitting
    // one careless import away from a route.
    const token = await startPasswordReset(email);
    const rotated = token ? await resetPassword(token, password) : { ok: false };
    if (rotated.ok) {
      console.log(`rotated  ${email} (sessions for this account signed out)`);
    } else {
      failed++;
      console.error(`refused  ${email} — password under ${MIN_PASSWORD_LENGTH} characters`);
    }
  } else if (result.reason === "email_exists") {
    // Not a failure: running this twice should be safe, and overwriting a
    // password nobody asked to change would be worse than doing nothing.
    console.log(`exists   ${email} (left as is; STEVE_SEED_OVERWRITE=1 to rotate)`);
  } else {
    failed++;
    console.error(
      `refused  ${email} — invalid email, or password under ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

process.exit(failed === 0 ? 0 : 1);
