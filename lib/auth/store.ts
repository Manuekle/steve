import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

/**
 * The lock on a self-hosted instance.
 *
 * Every account here shares one instance's data — the inbox, every contact,
 * the model keys on Settings — this file only gates who can sign in, not who
 * sees what once they're in. There are no per-user records anywhere else in
 * the app.
 *
 * It lives beside `credentials.ts` in `~/.steve/`, in the same shape: a JSON
 * file written through a temp file and a rename, so a crash mid-write cannot
 * leave a half-file that locks everyone out of their own install. `0600`,
 * because it holds password hashes.
 *
 * No database. The app's own state is already a file — `business.json` — and
 * the Postgres this project talks about belongs to the Eve workflow engine,
 * not to the app. Putting accounts in Postgres would mean the app could not
 * start without it, to check a handful of rows.
 */

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
    // A pre-multi-account file has `owner`, not `accounts` — read it into the
    // new shape here so the first write migrates it on disk. Skipping this
    // would make that first write silently drop the only account on the file:
    // `accounts` would read back as `[]` and overwrite `owner` with nothing.
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
  // `rename` keeps the temp file's mode, but an existing target that predates
  // this code would not have one, so set it either way.
  await chmod(AUTH_FILE, 0o600).catch(() => {});
}

/** Compares two strings without leaking where they first differ. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // `timingSafeEqual` throws on a length mismatch, which would itself be a
  // signal — hash both sides to a fixed width first.
  const l = createHash("sha256").update(left).digest();
  const r = createHash("sha256").update(right).digest();
  return timingSafeEqual(l, r);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Accounts ────────────────────────────────────────────────────────

export async function hasAnyAccount(): Promise<boolean> {
  return (await read()).accounts.length > 0;
}

/**
 * Open self-signup: any number of accounts can share this instance. Only a
 * duplicate email is refused — there's no cap and no invite gate.
 */
export async function createAccount(
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

/**
 * Checks the password and, on success, opens a session.
 *
 * The derivation always runs, even when the email matches no account, against
 * a throwaway salt. A wrong email would otherwise return in a microsecond and
 * a wrong password in a hundred milliseconds, which tells an attacker which
 * half they got right.
 */
export async function login(
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
 * Starts a reset: issues a token for the account with this email, if one
 * exists. Returns `null` either way to the caller's caller — the API route
 * always answers the same regardless, so an anonymous request can't be used
 * to check which emails have accounts.
 */
export async function startPasswordReset(email: string): Promise<string | null> {
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

/**
 * Completes a reset: on success, rehashes the password and drops every other
 * session open on that account, since a leaked-or-forgotten password means
 * any of them could belong to whoever had it.
 */
export async function resetPassword(
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

/**
 * Changes a signed-in account's own password — different from
 * `resetPassword`: that one comes from an emailed token with no session at
 * all, so it drops every open session on the account. This one comes from
 * inside an active session, so it keeps that one session alive and only
 * drops the *other* ones — the same "everywhere else gets signed out"
 * hygiene, without yanking the session the request is using right now.
 */
export async function changePassword(
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

// ── Sessions ────────────────────────────────────────────────────────

function prune(sessions: readonly Session[]): Session[] {
  const now = Date.now();
  return sessions.filter((session) => Date.parse(session.expiresAt) > now);
}

/**
 * A session is a random 256-bit token. Only its SHA-256 is stored, so a copy
 * of `auth.json` is not a set of working sessions — the same reason the
 * password is not stored either.
 */
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

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const store = await read();
  const wanted = hashToken(token);
  return prune(store.sessions).some((session) => equals(session.tokenHash, wanted));
}

/**
 * Which account a session belongs to — `verifySession` only answers whether
 * one is valid, not whose it is. Routes that need to act on "the signed-in
 * account" (changing its password, showing its email) resolve it here
 * instead of trusting a client-supplied email, which the session cookie
 * itself can't be tricked into claiming.
 */
export async function getSessionAccountEmail(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const store = await read();
  const wanted = hashToken(token);
  const session = prune(store.sessions).find((candidate) => equals(candidate.tokenHash, wanted));
  return session?.accountEmail ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const store = await read();
  const wanted = hashToken(token);
  await write({
    accounts: store.accounts,
    sessions: prune(store.sessions).filter((session) => session.tokenHash !== wanted),
  });
}

/** Cookie attributes, in one place so the login and logout routes agree. */
export function sessionCookie(token: string, secure: boolean) {
  return {
    httpOnly: true,
    maxAge: SESSION_DAYS * 86_400,
    name: SESSION_COOKIE,
    path: "/",
    // `lax`, not `strict`: the webhooks are not browser navigations, and
    // `strict` would drop the cookie on every arrival from an external link.
    sameSite: "lax" as const,
    secure,
    value: token,
  };
}
