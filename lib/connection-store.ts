// Tokens for the accounts connected from the Connections page.
//
// Two backends, chosen the same way lib/business-store.ts chooses: Postgres
// when WORKFLOW_POSTGRES_URL is set (which a deploy with no writable
// filesystem requires), otherwise ~/.steve/connections.json with a 0600 file
// mode. The first DB access imports an existing file once.
//
// Either way these are live access tokens to someone's CRM and calendar: they
// never go in .env, never reach the client, and are never echoed back by an
// API route. What the 0600 bits guard in file mode, the connection string
// guards in DB mode — give it the access you would give that file.
//
// A connection is refreshed lazily. Nothing runs on a timer — the first call
// that needs a token past its expiry trades the refresh token for a new one
// and writes it back. When that fails the connection is flagged rather than
// deleted, so the page can ask for a reconnect instead of quietly pretending
// the integration was never set up.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  getCredential,
  getCredentialPreviews,
  getStoredCredentials,
  saveCredentials,
} from "./credentials";
import {
  MANUAL_CONNECTIONS,
  OAUTH_CONNECTIONS,
  getConnectionDefinition,
  getManualConnectionDefinition,
  type ConnectionId,
  type ManualConnectionId,
} from "./connections";
import { refreshTokens, type TokenSet } from "./oauth-client";
import {
  hasDocument as dbHasDocument,
  migrateFromFileStore as dbMigrateFromFile,
  readDocument as dbReadDocument,
  updateDocument as dbUpdateDocument,
} from "./doc-store";

const STORE_FILE = join(homedir(), ".steve", "connections.json");

export type StoredConnection = {
  readonly accessToken: string;
  readonly refreshToken?: string;
  /** Epoch ms. Absent means the provider issues non-expiring tokens. */
  readonly expiresAt?: number;
  readonly scopes: readonly string[];
  readonly accountLabel?: string;
  readonly connectedAt: string;
  /** Set when a refresh failed: only a fresh grant can fix it. */
  readonly needsReconnect?: boolean;
};

type ConnectionStore = Partial<Record<ConnectionId, StoredConnection>>;

// ── Backend selection (resolved once, lazily) ─────────────────────

let dbMode: boolean | null = null;

async function usingDb(): Promise<boolean> {
  if (dbMode !== null) return dbMode;

  if (!process.env.WORKFLOW_POSTGRES_URL) {
    dbMode = false;
    return false;
  }

  try {
    if (!(await dbHasDocument("connections"))) {
      const file = await readFileStore();
      if (file !== null) await dbMigrateFromFile("connections", file);
    }
    dbMode = true;
  } catch {
    // Unreachable database: keep serving from the file rather than reporting
    // every connected account as disconnected. Retried on the next call.
    return false;
  }
  return dbMode;
}

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** The file's contents, or `null` when there is none to read — which is what
 *  tells the migration there is nothing to import. */
async function readFileStore(): Promise<ConnectionStore | null> {
  try {
    const raw = await readFile(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ConnectionStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return null;
  }
}

async function readStore(): Promise<ConnectionStore> {
  if (await usingDb()) {
    return (await dbReadDocument<ConnectionStore>("connections")) ?? {};
  }
  return (await readFileStore()) ?? {};
}

/**
 * Read, mutate and write the store.
 *
 * On Postgres the row lock inside the transaction is the serialisation, and it
 * holds across processes. On the file the in-process queue is all there is —
 * which is exactly the gap that makes two Steve processes racing over one
 * token file worth moving off.
 */
async function updateStore<T>(fn: (store: ConnectionStore) => T): Promise<T> {
  if (await usingDb()) {
    return dbUpdateDocument("connections", (raw) => raw ?? {}, fn);
  }
  return enqueue(async () => {
    const store = await readStore();
    const result = fn(store);
    await writeStore(store);
    return result;
  });
}

async function writeStore(store: ConnectionStore): Promise<void> {
  await mkdir(dirname(STORE_FILE), { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, STORE_FILE);
}

export async function getStoredConnection(id: ConnectionId): Promise<StoredConnection | undefined> {
  return (await readStore())[id];
}

export async function saveConnection(id: ConnectionId, tokens: TokenSet): Promise<void> {
  await updateStore((store) => {
    store[id] = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      accountLabel: tokens.accountLabel,
      connectedAt: new Date().toISOString(),
    };
  });
}

export async function removeConnection(id: ConnectionId): Promise<void> {
  await updateStore((store) => {
    delete store[id];
  });
}

async function patchConnection(id: ConnectionId, patch: Partial<StoredConnection>): Promise<void> {
  await updateStore((store) => {
    const current = store[id];
    if (!current) return;
    store[id] = { ...current, ...patch };
  });
}

/** The OAuth app's own credentials, when this install has them. */
export async function getClientCredentials(
  id: ConnectionId,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const { oauth } = getConnectionDefinition(id);
  const clientId = (await getCredential(oauth.clientIdKey))?.trim();
  const clientSecret = (await getCredential(oauth.clientSecretKey))?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * A usable access token for a connected account, refreshed if it has aged out.
 * `null` means the caller has to fall back — nothing is connected, or the
 * grant was revoked on the provider's side and only a reconnect will fix it.
 */
export async function getConnectionAccessToken(id: ConnectionId): Promise<string | null> {
  const stored = await getStoredConnection(id);
  if (!stored || stored.needsReconnect) return null;

  // A minute of headroom: a token that expires mid-request is a failure the
  // caller cannot retry cleanly.
  const stillValid = !stored.expiresAt || stored.expiresAt > Date.now() + 60_000;
  if (stillValid) return stored.accessToken;

  const definition = getConnectionDefinition(id);
  const client = await getClientCredentials(id);
  if (!definition.oauth.refreshable || !stored.refreshToken || !client) {
    await patchConnection(id, { needsReconnect: true });
    return null;
  }

  try {
    const tokens = await refreshTokens({
      definition,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      refreshToken: stored.refreshToken,
    });
    await patchConnection(id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? stored.refreshToken,
      expiresAt: tokens.expiresAt,
      needsReconnect: false,
    });
    return tokens.accessToken;
  } catch {
    await patchConnection(id, { needsReconnect: true });
    return null;
  }
}

export type ConnectionStatus = "connected" | "disconnected" | "needs_reconnect" | "unavailable";

export type OAuthConnectionSummary = {
  readonly id: ConnectionId;
  readonly label: string;
  readonly descriptionKey: string;
  readonly unlockKeys: readonly string[];
  readonly appDocsUrl: string;
  readonly status: ConnectionStatus;
  readonly accountLabel?: string;
  readonly connectedAt?: string;
  readonly scopeCount: number;
  /** The two credential keys that register this provider's OAuth *app* (not
   *  the person's account). Names only — never values — so the page can offer
   *  to fill them in when `status` is "unavailable". */
  readonly oauthAppKeys: readonly [string, string];
};

export type ManualConnectionSummary = {
  readonly id: string;
  readonly label: string;
  readonly descriptionKey: string;
  readonly reasonKey: string;
  readonly settingsGroup: string;
  /** Which fields of `settingsGroup` this card owns. Names only, no values —
   *  the inline dialog renders exactly these instead of the whole group. */
  readonly credentialKeys: readonly string[];
  readonly configured: boolean;
  /** Where the active value came from. "env" is configured and working but
   *  cannot be cleared from this app, so the page offers no Remove button for
   *  it — the same distinction Settings draws with its "from env" hint. */
  readonly source?: "store" | "env";
  /** Masked preview of the primary key ("sk-ant-…wXyz") — never the full
   *  value. See lib/credentials.ts's getCredentialPreviews. */
  readonly keyPreview?: string;
};

/**
 * What the Connections page draws. Deliberately token-free: the client is told
 * whether an account is connected and whose it is, never what the grant is
 * worth.
 */
export async function getConnectionSummaries(): Promise<{
  oauth: OAuthConnectionSummary[];
  manual: ManualConnectionSummary[];
}> {
  const store = await readStore();

  const oauth = await Promise.all(
    OAUTH_CONNECTIONS.map(async (definition): Promise<OAuthConnectionSummary> => {
      const stored = store[definition.id];
      const client = await getClientCredentials(definition.id);
      const status: ConnectionStatus = !client
        ? "unavailable"
        : !stored
          ? "disconnected"
          : stored.needsReconnect
            ? "needs_reconnect"
            : "connected";
      return {
        id: definition.id,
        label: definition.label,
        descriptionKey: definition.descriptionKey,
        unlockKeys: definition.unlockKeys,
        appDocsUrl: definition.appDocsUrl,
        status,
        accountLabel: stored?.accountLabel,
        connectedAt: stored?.connectedAt,
        scopeCount: definition.oauth.scopes.length,
        oauthAppKeys: [definition.oauth.clientIdKey, definition.oauth.clientSecretKey],
      };
    }),
  );

  const previews = await getCredentialPreviews();
  const stored = await getStoredCredentials();
  const manual = await Promise.all(
    MANUAL_CONNECTIONS.map(async (definition): Promise<ManualConnectionSummary> => {
      // A key that only exists in the environment is just as connected as one
      // typed here: the calls it authorises succeed either way. Counting only
      // the store made every env-configured vendor read "not connected" next
      // to an integration that was demonstrably working, which is the one
      // thing this page must never say.
      const configured = definition.credentialKeys.every(
        (key) => Boolean(stored[key]) || Boolean(process.env[key]),
      );
      const fromStore = definition.credentialKeys.some((key) => Boolean(stored[key]));
      return {
        id: definition.id,
        label: definition.label,
        descriptionKey: definition.descriptionKey,
        reasonKey: definition.reasonKey,
        settingsGroup: definition.settingsGroup,
        credentialKeys: [...definition.credentialKeys],
        configured,
        source: configured ? (fromStore ? "store" : "env") : undefined,
        keyPreview: previews[definition.previewKey ?? definition.credentialKeys[0]],
      };
    }),
  );

  return { oauth, manual };
}

/** Clears every credential key behind a manual (API-key) connection — the
 *  "disconnect" equivalent for a vendor with no OAuth grant to revoke.
 *  Rotating a key, as opposed to removing it, is just saving a new value
 *  over it through Settings/the manual-key dialog — same `saveCredentials`
 *  either way, nothing here to duplicate. */
export async function clearManualConnection(id: ManualConnectionId): Promise<void> {
  const definition = getManualConnectionDefinition(id);
  const updates: Partial<Record<(typeof definition.credentialKeys)[number], string>> = {};
  for (const key of definition.credentialKeys) updates[key] = "";
  await saveCredentials(updates);
}
