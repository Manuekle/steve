import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { poolMaxConnections } from "../postgres-target";
import { promisify } from "node:util";

/**
 * PostgreSQL-backed auth store for production deployments.
 *
 * Mirrors the interface of lib/auth/store.ts but stores accounts and sessions
 * in PostgreSQL instead of ~/.steve/auth.json. The schema is applied lazily
 * (CREATE SCHEMA IF NOT EXISTS) on first use — no separate migration step.
 *
 * Security properties preserved from the file-based store:
 * - Passwords: scrypt (N=16384, p=1, r=8, 64-byte key) with random 16-byte salt
 * - Sessions: random 256-bit token, only SHA-256 stored
 * - Timing-safe comparison on all hash checks
 * - Login always runs scrypt (even for wrong email) against throwaway salt
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; p: number; r: number },
) => Promise<Buffer>;

const SCRYPT = { N: 16384, p: 1, r: 8 } as const;
const KEY_LENGTH = 64;
const SESSION_DAYS = 30;
const RESET_TOKEN_HOURS = 1;
export const MIN_PASSWORD_LENGTH = 10;

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.WORKFLOW_POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "WORKFLOW_POSTGRES_URL is not set. Auth DB store needs the same Postgres connection.",
      );
    }
    pool = new Pool({ connectionString, max: poolMaxConnections() });
    // See lib/doc-store.ts: an unhandled pool `error` event is an uncaught
    // exception, and takes the whole process with it.
    pool.on("error", (error) => {
      console.error("[auth] postgres pool error", error);
    });
  }
  return pool;
}

// These live in `steve`, next to the document and blob tables, and not in a
// schema called `auth` — which is where they used to be, and which is a name
// this app does not get to own.
//
// On Supabase, `auth` is GoTrue's: it already holds `auth.users`,
// `steve.sessions` and twenty more tables, and the database role cannot create
// anything in it. `CREATE TABLE IF NOT EXISTS steve.sessions` against that is
// the worst possible outcome — not an error, a no-op, leaving every session
// query pointed at GoTrue's table, which has none of these columns. Any
// managed Postgres is free to reserve a name like that; `steve` is ours.
//
// Installs that predate this keep their accounts: `migrateFromLegacySchema`
// below moves them once, and only from a table whose shape proves it is one
// of ours.
const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS steve;

CREATE TABLE IF NOT EXISTS steve.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  reset_token_hash text,
  reset_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS steve.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL REFERENCES steve.accounts(email) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_steve_sessions_token_hash ON steve.sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_steve_sessions_expires_at ON steve.sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_steve_sessions_account_email ON steve.sessions (account_email);
`;

/**
 * Move accounts out of the old `auth` schema, once.
 *
 * Deliberately narrow. It runs only when `steve.accounts` is empty, and only
 * against an `steve.accounts` that has this app's own columns — on Supabase
 * that table does not exist at all, and `auth.users` (which does) will never
 * match. Sessions are not carried over: they are cheap to re-make and a
 * logged-in browser signing in again is a smaller cost than getting this
 * wrong.
 */
async function migrateFromLegacySchema(): Promise<void> {
  const pool = getPool();
  const already = await pool.query("SELECT 1 FROM steve.accounts LIMIT 1");
  if ((already.rowCount ?? 0) > 0) return;

  const legacy = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'accounts'
        AND column_name IN ('email', 'password_hash', 'password_salt')`,
  );
  if ((legacy.rowCount ?? 0) < 3) return;

  await pool.query(
    `INSERT INTO steve.accounts
       (email, password_hash, password_salt, reset_token_hash, reset_token_expires_at, created_at)
     SELECT email, password_hash, password_salt, reset_token_hash, reset_token_expires_at, created_at
       FROM auth.accounts
     ON CONFLICT (email) DO NOTHING`,
  );
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => migrateFromLegacySchema())
      .catch((error: unknown) => {
        // Let the next call retry rather than caching a failure for the life
        // of the process — see lib/doc-store.ts.
        schemaReady = undefined;
        throw error;
      });
  }
  await schemaReady;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const l = createHash("sha256").update(left).digest();
  const r = createHash("sha256").update(right).digest();
  return timingSafeEqual(l, r);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newSessionToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000),
  };
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export async function hasAnyAccount(): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query("SELECT 1 FROM steve.accounts LIMIT 1");
  return result.rowCount! > 0;
}

export async function createAccount(
  email: string,
  password: string,
): Promise<{ ok: false; reason: "email_exists" | "invalid" } | { ok: true; token: string }> {
  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised) || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "invalid" };
  }

  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    // Check for duplicate email
    const existing = await client.query("SELECT 1 FROM steve.accounts WHERE email = $1", [normalised]);
    if (existing.rowCount! > 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "email_exists" };
    }

    // Hash password
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT);

    // Insert account
    await client.query(
      `INSERT INTO steve.accounts (email, password_hash, password_salt)
       VALUES ($1, $2, $3)`,
      [normalised, derived.toString("hex"), salt.toString("hex")],
    );

    // Create session
    const session = newSessionToken();
    await client.query(
      `INSERT INTO steve.sessions (account_email, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [normalised, session.tokenHash, session.expiresAt],
    );

    await client.query("COMMIT");
    return { ok: true, token: session.token };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: false } | { ok: true; token: string }> {
  const normalised = email.trim().toLowerCase();
  await ensureSchema();

  const result = await getPool().query(
    "SELECT password_hash, password_salt FROM steve.accounts WHERE email = $1",
    [normalised],
  );

  const account = result.rows[0];
  // Always run scrypt to prevent timing oracle
  const salt = Buffer.from(account?.password_salt ?? randomBytes(16).toString("hex"), "hex");
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT);

  if (!account) return { ok: false };
  if (!equals(derived.toString("hex"), account.password_hash)) return { ok: false };

  // Create session
  const session = newSessionToken();
  await getPool().query(
    `INSERT INTO steve.sessions (account_email, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [normalised, session.tokenHash, session.expiresAt],
  );

  return { ok: true, token: session.token };
}

export async function startPasswordReset(email: string): Promise<string | null> {
  const normalised = email.trim().toLowerCase();
  await ensureSchema();

  const result = await getPool().query(
    "SELECT id FROM steve.accounts WHERE email = $1",
    [normalised],
  );
  if (result.rowCount === 0) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 3_600_000);

  await getPool().query(
    `UPDATE steve.accounts
       SET reset_token_hash = $1, reset_token_expires_at = $2
     WHERE email = $3`,
    [hashToken(token), expiresAt, normalised],
  );

  return token;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: false } | { ok: true }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false };

  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const wanted = hashToken(token);
    const now = new Date();

    const result = await client.query(
      `SELECT id, email FROM steve.accounts
       WHERE reset_token_hash IS NOT NULL
         AND reset_token_hash = $1
         AND reset_token_expires_at > $2`,
      [wanted, now],
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false };
    }

    const account = result.rows[0];
    const salt = randomBytes(16);
    const derived = await scrypt(newPassword, salt, KEY_LENGTH, SCRYPT);

    // Update password, clear reset token
    await client.query(
      `UPDATE steve.accounts
         SET password_hash = $1, password_salt = $2,
             reset_token_hash = NULL, reset_token_expires_at = NULL
       WHERE id = $3`,
      [derived.toString("hex"), salt.toString("hex"), account.id],
    );

    // Drop all other sessions on this account
    await client.query(
      "DELETE FROM steve.sessions WHERE account_email = $1",
      [account.email],
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
  currentToken: string,
): Promise<{ ok: false; reason: "wrong_password" | "invalid" } | { ok: true }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "invalid" };

  const normalised = email.trim().toLowerCase();
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT id, password_hash, password_salt FROM steve.accounts WHERE email = $1",
      [normalised],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "wrong_password" };
    }

    const account = result.rows[0];
    const currentSalt = Buffer.from(account.password_salt, "hex");
    const derivedCurrent = await scrypt(currentPassword, currentSalt, KEY_LENGTH, SCRYPT);
    if (!equals(derivedCurrent.toString("hex"), account.password_hash)) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "wrong_password" };
    }

    const newSalt = randomBytes(16);
    const derivedNew = await scrypt(newPassword, newSalt, KEY_LENGTH, SCRYPT);

    await client.query(
      `UPDATE steve.accounts
         SET password_hash = $1, password_salt = $2
       WHERE id = $3`,
      [derivedNew.toString("hex"), newSalt.toString("hex"), account.id],
    );

    // Keep current session, drop all others
    const currentTokenHash = hashToken(currentToken);
    await client.query(
      `DELETE FROM steve.sessions
       WHERE account_email = $1 AND token_hash != $2`,
      [normalised, currentTokenHash],
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  await ensureSchema();

  const wanted = hashToken(token);
  const result = await getPool().query(
    "SELECT 1 FROM steve.sessions WHERE token_hash = $1 AND expires_at > now()",
    [wanted],
  );
  return result.rowCount! > 0;
}

export async function getSessionAccountEmail(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  await ensureSchema();

  const wanted = hashToken(token);
  const result = await getPool().query(
    "SELECT account_email FROM steve.sessions WHERE token_hash = $1 AND expires_at > now()",
    [wanted],
  );
  return result.rows[0]?.account_email ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await ensureSchema();

  const wanted = hashToken(token);
  await getPool().query("DELETE FROM steve.sessions WHERE token_hash = $1", [wanted]);
}

// ── Migration from file-based store ──────────────────────────────────────────

/**
 * One-time migration: reads ~/.steve/auth.json, inserts all accounts and
 * sessions into PostgreSQL. Safe to re-run (idempotent on email uniqueness).
 * Returns the number of accounts migrated.
 */
export async function migrateFromFileStore(
  fileStore: { accounts: Array<{ email: string; hash: string; salt: string; createdAt: string }>; sessions: Array<{ accountEmail: string; tokenHash: string; createdAt: string; expiresAt: string }> },
): Promise<number> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    let migrated = 0;
    for (const account of fileStore.accounts) {
      try {
        await client.query(
          `INSERT INTO steve.accounts (email, password_hash, password_salt, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO NOTHING`,
          [account.email, account.hash, account.salt, account.createdAt],
        );
        migrated++;
      } catch {
        // Skip duplicate
      }
    }

    // Migrate sessions (best-effort, token hashes may reference old accounts)
    for (const session of fileStore.sessions) {
      try {
        await client.query(
          `INSERT INTO steve.sessions (account_email, token_hash, created_at, expires_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (token_hash) DO NOTHING`,
          [session.accountEmail, session.tokenHash, session.createdAt, session.expiresAt],
        );
      } catch {
        // Skip invalid sessions (account may not exist, etc.)
      }
    }

    await client.query("COMMIT");
    return migrated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Check if the DB has any accounts (for migration decision). */
export async function dbHasAccounts(): Promise<boolean> {
  await ensureSchema();
  const result = await getPool().query("SELECT 1 FROM steve.accounts LIMIT 1");
  return result.rowCount! > 0;
}
