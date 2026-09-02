// The OAuth 2 authorization-code flow, once, for every provider in the
// connections catalog.
//
// Providers agree on the shape of the flow and disagree on every detail of
// it: Notion wants a JSON body behind HTTP Basic, Slack answers 200 with
// `ok: false` instead of an error status, and HubSpot names the account in a
// path segment rather than a header. Those differences live in the catalog as
// data; this file is the one code path that reads them.

import { createHash, randomBytes } from "node:crypto";
import type { OAuthConfig, OAuthConnection } from "./connections";

export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken?: string;
  /** Epoch ms. Absent for providers that issue non-expiring tokens. */
  readonly expiresAt?: number;
  readonly scopes: readonly string[];
  /** Whatever the provider called the account, when it said so at all. */
  readonly accountLabel?: string;
};

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

/** URL-safe base64 without padding, as RFC 7636 asks for. */
function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createVerifier(): string {
  return base64url(randomBytes(32));
}

export function challengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function createState(): string {
  return base64url(randomBytes(24));
}

/** One-shot cookies that carry the flow across the hop to the provider. */
export const stateCookie = (provider: string) => `steve_oauth_state_${provider}`;
export const verifierCookie = (provider: string) => `steve_oauth_verifier_${provider}`;

export function redirectUriFor(origin: string, id: string): string {
  return `${origin}/api/connections/${id}/callback`;
}

export function buildAuthorizeUrl(args: {
  readonly definition: OAuthConnection;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge?: string;
}): string {
  const { oauth } = args.definition;
  const url = new URL(oauth.authorizeUrl);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", args.state);
  if (oauth.scopes.length > 0) {
    url.searchParams.set("scope", oauth.scopes.join(oauth.scopeSeparator));
  }
  for (const [key, value] of Object.entries(oauth.authParams ?? {})) {
    url.searchParams.set(key, value);
  }
  if (oauth.pkce && args.codeChallenge) {
    url.searchParams.set("code_challenge", args.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

type RawTokenResponse = Record<string, unknown>;

async function postToken(
  oauth: OAuthConfig,
  clientId: string,
  clientSecret: string,
  params: Record<string, string>,
): Promise<RawTokenResponse> {
  const headers: Record<string, string> = { accept: "application/json" };
  const payload: Record<string, string> = { ...params };

  if (oauth.tokenAuth === "basic") {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers.authorization = `Basic ${basic}`;
  } else {
    payload.client_id = clientId;
    payload.client_secret = clientSecret;
  }

  let body: string;
  if (oauth.tokenBody === "json") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(payload);
    // Notion rejects any request without a pinned API version.
    headers["Notion-Version"] = "2022-06-28";
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(payload).toString();
  }

  const response = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  let parsed: RawTokenResponse;
  try {
    parsed = JSON.parse(text) as RawTokenResponse;
  } catch {
    throw new OAuthError(`Token endpoint returned a non-JSON body: ${text.slice(0, 200)}`, response.status);
  }
  if (!response.ok) {
    const detail = String(parsed.error_description ?? parsed.error ?? text.slice(0, 200));
    throw new OAuthError(detail, response.status);
  }
  // Slack answers 200 for failures and puts the verdict in the body.
  if (parsed.ok === false) {
    throw new OAuthError(String(parsed.error ?? "The provider rejected the exchange."), 400);
  }
  if (typeof parsed.access_token !== "string") {
    throw new OAuthError("The token response carried no access token.", 502);
  }
  return parsed;
}

/** Walk a dot path, e.g. "resource.email" or "team.name". */
function readPath(source: unknown, path: string): string | undefined {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.length > 0 ? current : undefined;
}

/**
 * The human-readable name of the account that just granted access — an email
 * for Google, a workspace for Slack and Notion, a portal domain
 * for HubSpot. Best-effort by design: a connection that works but cannot say
 * whose it is still beats a failed connect.
 */
async function resolveAccountLabel(
  oauth: OAuthConfig,
  raw: RawTokenResponse,
  accessToken: string,
): Promise<string | undefined> {
  if (oauth.accountPath) {
    const fromToken = readPath(raw, oauth.accountPath);
    if (fromToken) return fromToken;
  }
  if (!oauth.identityUrl) return undefined;
  try {
    const url = oauth.identityUrl.replace("{token}", encodeURIComponent(accessToken));
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as unknown;
    return oauth.identityPath ? readPath(body, oauth.identityPath) : undefined;
  } catch {
    return undefined;
  }
}

function toTokenSet(
  oauth: OAuthConfig,
  raw: RawTokenResponse,
  fallbackScopes: readonly string[],
  accountLabel?: string,
): TokenSet {
  const expiresIn = typeof raw.expires_in === "number" ? raw.expires_in : undefined;
  const scope = typeof raw.scope === "string" ? raw.scope : undefined;
  return {
    accessToken: raw.access_token as string,
    refreshToken: typeof raw.refresh_token === "string" ? raw.refresh_token : undefined,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : [...fallbackScopes],
    accountLabel,
  };
}

export async function exchangeCode(args: {
  readonly definition: OAuthConnection;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier?: string;
}): Promise<TokenSet> {
  const { oauth } = args.definition;
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  };
  if (oauth.pkce && args.codeVerifier) params.code_verifier = args.codeVerifier;

  const raw = await postToken(oauth, args.clientId, args.clientSecret, params);
  const accessToken = raw.access_token as string;
  const label = await resolveAccountLabel(oauth, raw, accessToken);
  return toTokenSet(oauth, raw, oauth.scopes, label);
}

export async function refreshTokens(args: {
  readonly definition: OAuthConnection;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}): Promise<TokenSet> {
  const { oauth } = args.definition;
  const raw = await postToken(oauth, args.clientId, args.clientSecret, {
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  });
  const refreshed = toTokenSet(oauth, raw, oauth.scopes);
  // Google returns no refresh token on a refresh: the one already on file
  // stays valid, and dropping it here would end the connection at the next
  // expiry.
  return refreshed.refreshToken ? refreshed : { ...refreshed, refreshToken: args.refreshToken };
}
