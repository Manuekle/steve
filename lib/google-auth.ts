import { createSign } from "node:crypto";
import { getConnectionAccessToken } from "./connection-store";
import { getCredential } from "./credentials";

// Shared Google API authentication via service account.
// Signs a JWT, trades it for an access token, caches for the token's lifetime.

export type ServiceAccount = {
  readonly client_email: string;
  readonly private_key: string;
};

export function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function parseServiceAccount(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  const account = parsed as Partial<ServiceAccount>;
  if (!account.client_email || !account.private_key) {
    throw new Error("Service account JSON is missing client_email or private_key.");
  }
  return account as ServiceAccount;
}

// Access tokens are valid for an hour; caching avoids re-signing a JWT and
// round-tripping to Google on every step of every automation run.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getAccessToken(account: ServiceAccount, scope: string): Promise<string> {
  const cacheKey = `${account.client_email}:${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signature = base64url(createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

/**
 * A Google access token for `scope`, from whichever identity this install has.
 *
 * The connected account wins. Someone who signed in on the Connections page
 * has said, in the clearest way available, which Google account this app acts
 * as — and that grant covers Sheets, Calendar and Drive at once, so no
 * spreadsheet has to be shared with a robot's email address first. The service
 * account stays as the fallback, because installs that were set up that way
 * keep working without touching anything.
 *
 * `null` means neither identity is configured; the caller reports that as a
 * skipped step rather than a crash.
 */
export async function getGoogleToken(scope: string): Promise<string | null> {
  const connected = await getConnectionAccessToken("google");
  if (connected) return connected;

  const serviceAccountJson = await getCredential("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) return null;
  return getAccessToken(parseServiceAccount(serviceAccountJson), scope);
}
