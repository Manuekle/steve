import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  migrateFromFileStore as dbMigrateFromFile,
  hasAnyAccount as dbHasAnyAccount,
  createAccount as dbCreateAccount,
  login as dbLogin,
  loginWithVerifiedEmail as dbLoginWithVerifiedEmail,
  startPasswordReset as dbStartPasswordReset,
  resetPassword as dbResetPassword,
  changePassword as dbChangePassword,
  verifySession as dbVerifySession,
  getSessionAccountEmail as dbGetSessionAccountEmail,
  destroySession as dbDestroySession,
  dbHasAccounts,
} from "./db-store";

/**
 * Auth store with automatic DB/file routing.
 *
 * When WORKFLOW_POSTGRES_URL is set, accounts and sessions live in PostgreSQL
 * (auth schema). When it is not — or on first boot before the DB is reachable —
 * the store falls back to ~/.steve/auth.json, the original file-based design.
 *
 * On the first DB access, if the file exists and the DB is empty, data is
 * migrated automatically. After migration the file is kept as backup but all
 * reads and writes go through the database.
 *
 * The file-based path is preserved for single-instance installs where
 * PostgreSQL is not available (e.g. a quick local trial).
 */

// ── DB availability detection (resolved once, lazily) ────────────────────────

let dbMode: boolean | null = null;

async function useDb(): Promise<boolean> {
  if (dbMode !== null) return dbMode;

  // No Postgres URL → file mode
  if (!process.env.WORKFLOW_POSTGRES_URL) {
    dbMode = false;
    return false;
  }

  try {
    // DB reachable → check if it has accounts yet
    const hasDb = await dbHasAccounts();
    if (hasDb) {
      dbMode = true;
      return true;
    }

    // DB is reachable but empty — check if we have a file to migrate from
    try {
      const raw = await readFile(AUTH_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // Check for `owner` (legacy) or `accounts` (current) shape
      const hasOwner = "owner" in parsed && parsed.owner != null;
      const hasAccounts =
        "accounts" in parsed &&
        Array.isArray(parsed.accounts) &&
        parsed.accounts.length > 0;

      if (hasOwner || hasAccounts) {
        // Migrate file → DB
        const fileStore = await read();
        await dbMigrateFromFile(fileStore);
      }
    } catch {
      // No file or unreadable — that's fine, fresh DB install
    }

    dbMode = true;
    return true;
  } catch (error) {
    // DB not reachable — fall back to file
    console.error(
      "[auth/store] useDb() failed, falling back to the file store:",
      error instanceof Error ? error.message : String(error),
    );
    dbMode = false;
    return false;
  }
}

// ── File-based store (original logic, preserved) ─────────────────────────────

const AUTH_FILE = join(homedir(), ".steve", "auth.json");

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; p: number; r: number },
) => Promise<Buffer>;

/** ~100ms on a normal machine, which is the point. */
const SCRYPT = { N: 16384, p: 1, r: 8 } as const;
const KEY_LENGTH = 64;

const SESSION_DAYS = 30;
export const SESSION_COOKIE = "steve_session";

/** One hour: long enough to find the email, short enough to matter if it leaks. */
const RESET_TOKEN_HOURS = 1;

/** Long enough that a weak password is the only weak link left. */
export const MIN_PASSWORD_LENGTH = 10;

type Account = {
  readonly createdAt: string;
  readonly email: string;
  readonly hash: string;
  readonly salt: string;
  /** Set while a reset link is outstanding; cleared on use or by a newer request. */
  readonly resetTokenHash?: string;
  readonly resetTokenExpiresAt?: string;
};

type Session = {
  readonly accountEmail: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /** The SHA-256 of the token, never the token — see `newSession`. */
  readonly tokenHash: string;
};

type AuthStore = {
  accounts: Account[];
  sessions: Session[];
};

function empty(): AuthStore {
  return { accounts: [], sessions: [] };
}

/** The file's shape before multi-account: one owner, sessions with no account reference. */
type LegacyAuthStore = {
  owner: Omit<Account, "resetTokenHash" | "resetTokenExpiresAt"> | null;
  sessions: readonly Omit<Session, "accountEmail">[];
};

async function read(): Promise<AuthStore> {
  try {
    const parsed = JSON.parse(await readFile(AUTH_FILE, "utf-8")) as Record<string, unknown>;
    if ("owner" in parsed) {
      const legacy = parsed as unknown as Partial<LegacyAuthStore>;
      const owner = legacy.owner ?? null;
      return {
        accounts: owner ? [owner] : [],
        sessions: owner
          ? (legacy.sessions ?? []).map((session) => ({ ...session, accountEmail: owner.email }))
          : [],
      };
    }
    const current = parsed as unknown as Partial<AuthStore>;
    return { accounts: current.accounts ?? [], sessions: current.sessions ?? [] };
  } catch {
    return empty();
  }
}

async function write(store: AuthStore): Promise<void> {
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  const tmp = `${AUTH_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, AUTH_FILE);
  await chmod(AUTH_FILE, 0o600).catch(() => {});
}

/** Compares two strings without leaking where they first differ. */
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

// ── File-based account/session helpers ───────────────────────────────────────

function fileHasAnyAccount(store: AuthStore): boolean {
  return store.accounts.length > 0;
}

async function fileCreateAccount(
  email: string,
  password: string,
): Promise<{ ok: false; reason: "email_exists" | "invalid" } | { ok: true; token: string }> {
  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised) || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: "invalid" };
  }

  const store = await read();
  if (store.accounts.some((account) => account.email === normalised)) {
    return { ok: false, reason: "email_exists" };
  }

  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  const session = newSession(normalised);

  await write({
    accounts: [
      ...store.accounts,
      {
        createdAt: new Date().toISOString(),
        email: normalised,
        hash: derived.toString("hex"),
        salt: salt.toString("hex"),
      },
    ],
    sessions: [...prune(store.sessions), session.record],
  });

  return { ok: true, token: session.token };
}

async function fileLogin(
  email: string,
  password: string,
): Promise<{ ok: false } | { ok: true; token: string }> {
  const store = await read();
  const normalised = email.trim().toLowerCase();
  const account = store.accounts.find((candidate) => candidate.email === normalised);
  const salt = Buffer.from(account?.salt ?? randomBytes(16).toString("hex"), "hex");
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT);

  if (!account) return { ok: false };
  const passwordMatches = equals(derived.toString("hex"), account.hash);
  if (!passwordMatches) return { ok: false };

  const session = newSession(account.email);
  await write({ accounts: store.accounts, sessions: [...prune(store.sessions), session.record] });
  return { ok: true, token: session.token };
}

/**
 * Sign in (or, on a first visit, sign up) with an email a third party — right
 * now, only Google — already verified. There is no password to check: the
 * account gets one anyway, random and never revealed, purely so the row
 * shape matches every other account's. It is never compared against
 * anything; `fileLogin`/`dbLogin` remain the only path that reads it.
 */
async function fileLoginWithVerifiedEmail(email: string): Promise<{ token: string }> {
  const normalised = email.trim().toLowerCase();
  const store = await read();
  let accounts = store.accounts;

  if (!accounts.some((account) => account.email === normalised)) {
    const salt = randomBytes(16);
    const derived = await scrypt(randomBytes(32).toString("hex"), salt, KEY_LENGTH, SCRYPT);
    accounts = [
      ...accounts,
      {
        createdAt: new Date().toISOString(),
        email: normalised,
        hash: derived.toString("hex"),
        salt: salt.toString("hex"),
      },
    ];
  }

  const session = newSession(normalised);
  await write({ accounts, sessions: [...prune(store.sessions), session.record] });
  return { token: session.token };
}

async function fileStartPasswordReset(email: string): Promise<string | null> {
  const store = await read();
  const normalised = email.trim().toLowerCase();
  const index = store.accounts.findIndex((candidate) => candidate.email === normalised);
  if (index === -1) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 3_600_000).toISOString();
  const accounts = [...store.accounts];
  accounts[index] = { ...accounts[index], resetTokenHash: hashToken(token), resetTokenExpiresAt: expiresAt };

  await write({ accounts, sessions: store.sessions });
  return token;
}

async function fileResetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: false } | { ok: true }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false };

  const store = await read();
  const wanted = hashToken(token);
  const now = Date.now();
  const index = store.accounts.findIndex(
    (candidate) =>
      candidate.resetTokenHash &&
      equals(candidate.resetTokenHash, wanted) &&
      candidate.resetTokenExpiresAt &&
      Date.parse(candidate.resetTokenExpiresAt) > now,
  );
  if (index === -1) return { ok: false };

  const account = store.accounts[index];
  const salt = randomBytes(16);
  const derived = await scrypt(newPassword, salt, KEY_LENGTH, SCRYPT);

  const accounts = [...store.accounts];
  accounts[index] = {
    createdAt: account.createdAt,
    email: account.email,
    hash: derived.toString("hex"),
    salt: salt.toString("hex"),
  };

  await write({
    accounts,
    sessions: prune(store.sessions).filter((session) => session.accountEmail !== account.email),
  });
  return { ok: true };
}

async function fileChangePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
  currentToken: string,
): Promise<{ ok: false; reason: "wrong_password" | "invalid" } | { ok: true }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "invalid" };

  const store = await read();
  const normalised = email.trim().toLowerCase();
  const index = store.accounts.findIndex((candidate) => candidate.email === normalised);
  if (index === -1) return { ok: false, reason: "wrong_password" };

  const account = store.accounts[index];
  const currentSalt = Buffer.from(account.salt, "hex");
  const derivedCurrent = await scrypt(currentPassword, currentSalt, KEY_LENGTH, SCRYPT);
  if (!equals(derivedCurrent.toString("hex"), account.hash)) {
    return { ok: false, reason: "wrong_password" };
  }

  const newSalt = randomBytes(16);
  const derivedNew = await scrypt(newPassword, newSalt, KEY_LENGTH, SCRYPT);
  const accounts = [...store.accounts];
  accounts[index] = {
    createdAt: account.createdAt,
    email: account.email,
    hash: derivedNew.toString("hex"),
    salt: newSalt.toString("hex"),
  };

  const currentTokenHash = hashToken(currentToken);
  const sessions = prune(store.sessions).filter(
    (session) => session.accountEmail !== normalised || session.tokenHash === currentTokenHash,
  );

  await write({ accounts, sessions });
  return { ok: true };
}

// ── Session helpers ──────────────────────────────────────────────────────────

function prune(sessions: readonly Session[]): Session[] {
  const now = Date.now();
  return sessions.filter((session) => Date.parse(session.expiresAt) > now);
}

function newSession(accountEmail: string): { record: Session; token: string } {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  return {
    record: {
      accountEmail,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString(),
      tokenHash: hashToken(token),
    },
    token,
  };
}

async function fileVerifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const store = await read();
  const wanted = hashToken(token);
  return prune(store.sessions).some((session) => equals(session.tokenHash, wanted));
}

async function fileGetSessionAccountEmail(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const store = await read();
  const wanted = hashToken(token);
  const session = prune(store.sessions).find((candidate) => equals(candidate.tokenHash, wanted));
  return session?.accountEmail ?? null;
}

async function fileDestroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const store = await read();
  const wanted = hashToken(token);
  await write({
    accounts: store.accounts,
    sessions: prune(store.sessions).filter((session) => session.tokenHash !== wanted),
  });
}

// ── Public API: routes to DB or file ─────────────────────────────────────────

export async function hasAnyAccount(): Promise<boolean> {
  return (await useDb()) ? dbHasAnyAccount() : fileHasAnyAccount(await read());
}

export async function createAccount(
  email: string,
  password: string,
): Promise<{ ok: false; reason: "email_exists" | "invalid" } | { ok: true; token: string }> {
  return (await useDb()) ? dbCreateAccount(email, password) : fileCreateAccount(email, password);
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: false } | { ok: true; token: string }> {
  return (await useDb()) ? dbLogin(email, password) : fileLogin(email, password);
}

/** See `fileLoginWithVerifiedEmail` — the email has already been proven by
 *  whoever is calling this (Google, today), so there is no password to check
 *  here either. */
export async function loginWithVerifiedEmail(email: string): Promise<{ token: string }> {
  return (await useDb()) ? dbLoginWithVerifiedEmail(email) : fileLoginWithVerifiedEmail(email);
}

export async function startPasswordReset(email: string): Promise<string | null> {
  return (await useDb()) ? dbStartPasswordReset(email) : fileStartPasswordReset(email);
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: false } | { ok: true }> {
  return (await useDb()) ? dbResetPassword(token, newPassword) : fileResetPassword(token, newPassword);
}

export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
  currentToken: string,
): Promise<{ ok: false; reason: "wrong_password" | "invalid" } | { ok: true }> {
  return (await useDb())
    ? dbChangePassword(email, currentPassword, newPassword, currentToken)
    : fileChangePassword(email, currentPassword, newPassword, currentToken);
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  return (await useDb()) ? dbVerifySession(token) : fileVerifySession(token);
}

export async function getSessionAccountEmail(token: string | undefined): Promise<string | null> {
  return (await useDb()) ? dbGetSessionAccountEmail(token) : fileGetSessionAccountEmail(token);
}

export async function destroySession(token: string | undefined): Promise<void> {
  return (await useDb()) ? dbDestroySession(token) : fileDestroySession(token);
}

/** Cookie attributes, in one place so the login and logout routes agree. */
export function sessionCookie(token: string, secure: boolean) {
  return {
    httpOnly: true,
    maxAge: SESSION_DAYS * 86_400,
    name: SESSION_COOKIE,
    path: "/",
    sameSite: "lax" as const,
    secure,
    value: token,
  };
}

/** Reset the DB mode cache — useful for tests or when config changes at runtime. */
export function resetDbMode(): void {
  dbMode = null;
}
