import { MetaApiError } from "./meta-ads";
import { SITE_URL } from "./site";

// Instagram Business Login (one-click connect) helpers.
//
// Flow: the browser opens Meta's authorization window
// (https://www.instagram.com/oauth/authorize), the user grants the messaging
// permissions, and Meta redirects to this app's callback with a one-hour
// `code`. The callback trades it server-side — first for a short-lived user
// token, then for a 60-day long-lived one — resolves the professional
// account, subscribes it to the messaging webhooks, and stores everything.
// The Instagram App Secret never leaves the server.
//
// Hosts matter here: login and token endpoints live on instagram.com /
// api.instagram.com / graph.instagram.com, not graph.facebook.com, and the
// credentials are the *Instagram* App ID/Secret (Business login settings),
// not the Meta App ID/Secret.
//
// Pure by design: `fetchFn` is injectable so every step is unit-testable
// without touching Meta.

export const IG_GRAPH_VERSION = "v26.0";
const IG_GRAPH_BASE = "https://graph.instagram.com";
const IG_OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
const IG_OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";

/** Messaging needs basic (account resolution) plus manage_messages (DMs). */
export const IG_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
] as const;

export const IG_SUBSCRIBED_FIELDS = "messages,message_reactions,messaging_postbacks,messaging_seen";

/** One-shot CSRF cookie between the popup start and Meta's callback. */
export const IG_STATE_COOKIE = "senka_ig_embedded_state";

/**
 * Where Meta redirects after authorization. Registered once in Business
 * login settings (Valid OAuth Redirect URIs) — the exchange rejects any
 * other value, so every step of the flow builds it from here.
 */
export function igEmbeddedCallbackUrl(): string {
  return `${SITE_URL}/api/channels/instagram/embedded/callback`;
}

export type IgShortToken = {
  readonly accessToken: string;
  readonly userId: string;
  readonly permissions: string;
};

export type IgLongToken = {
  readonly accessToken: string;
  /** Seconds until expiry — 60 days fresh, shorter on refresh. */
  readonly expiresIn?: number;
};

export type IgAccount = {
  readonly id: string;
  readonly username?: string;
};

type FetchFn = typeof fetch;

type GraphErrorBody = {
  error?: {
    message?: string;
    error_user_msg?: string;
    code?: number;
    error_subcode?: number;
  };
};

async function throwForIgError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as GraphErrorBody;
  const err = body?.error;
  throw new MetaApiError(
    err?.error_user_msg ?? err?.message ?? `Meta API ${res.status}`,
    res.status,
    err?.code,
    err?.error_subcode,
  );
}

/** The authorization window the popup opens. */
export function buildBusinessLoginUrl(opts: {
  readonly igAppId: string;
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
  readonly state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.igAppId.trim(),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: [...(opts.scopes ?? IG_LOGIN_SCOPES)].join(","),
    state: opts.state,
  });
  return `${IG_OAUTH_AUTHORIZE}?${params.toString()}`;
}

/**
 * Trade the authorization `code` for a short-lived (1h) user token.
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 */
export async function exchangeIgCode(
  opts: {
    readonly igAppId: string;
    readonly igSecret: string;
    readonly redirectUri: string;
    readonly code: string;
  },
  fetchFn: FetchFn = fetch,
): Promise<IgShortToken> {
  if (!opts.code.trim()) throw new Error("Instagram authorization code is required.");
  const body = new URLSearchParams({
    client_id: opts.igAppId.trim(),
    client_secret: opts.igSecret,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
    code: opts.code.trim(),
  });
  const res = await fetchFn(IG_OAUTH_TOKEN, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) await throwForIgError(res);
  const parsed = (await res.json()) as {
    access_token?: string;
    user_id?: number | string;
    permissions?: string;
  };
  if (!parsed.access_token || parsed.user_id === undefined) {
    throw new Error("Instagram returned no access token for the authorization code.");
  }
  return {
    accessToken: parsed.access_token,
    userId: String(parsed.user_id),
    permissions: parsed.permissions ?? "",
  };
}

/** Trade a short-lived token for a 60-day long-lived one. */
export async function exchangeForLongLivedToken(
  opts: { readonly igSecret: string; readonly shortToken: string },
  fetchFn: FetchFn = fetch,
): Promise<IgLongToken> {
  const url =
    `${IG_GRAPH_BASE}/access_token` +
    `?grant_type=ig_exchange_token` +
    `&client_secret=${encodeURIComponent(opts.igSecret)}` +
    `&access_token=${encodeURIComponent(opts.shortToken)}`;
  const res = await fetchFn(url, { method: "GET", cache: "no-store" });
  if (!res.ok) await throwForIgError(res);
  const parsed = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error("Instagram returned no long-lived token.");
  return {
    accessToken: parsed.access_token,
    ...(typeof parsed.expires_in === "number" ? { expiresIn: parsed.expires_in } : {}),
  };
}

/** Refresh a long-lived token for another 60 days. Valid while unexpired. */
export async function refreshLongLivedToken(
  opts: { readonly longToken: string },
  fetchFn: FetchFn = fetch,
): Promise<IgLongToken> {
  const url =
    `${IG_GRAPH_BASE}/refresh_access_token` +
    `?grant_type=ig_refresh_token` +
    `&access_token=${encodeURIComponent(opts.longToken)}`;
  const res = await fetchFn(url, { method: "GET", cache: "no-store" });
  if (!res.ok) await throwForIgError(res);
  const parsed = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error("Instagram refused the token refresh.");
  return {
    accessToken: parsed.access_token,
    ...(typeof parsed.expires_in === "number" ? { expiresIn: parsed.expires_in } : {}),
  };
}

/** Resolve the professional account behind a user token. */
export async function getIgAccount(
  opts: { readonly accessToken: string },
  fetchFn: FetchFn = fetch,
): Promise<IgAccount> {
  const res = await fetchFn(
    `${IG_GRAPH_BASE}/${IG_GRAPH_VERSION}/me?fields=id,username`,
    {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    },
  );
  if (!res.ok) await throwForIgError(res);
  const parsed = (await res.json()) as { id?: number | string; username?: string };
  if (parsed.id === undefined) throw new Error("Instagram returned no account id.");
  return { id: String(parsed.id), ...(parsed.username ? { username: parsed.username } : {}) };
}

/**
 * Subscribe the account to the messaging webhooks so DMs start flowing.
 * This is the per-account half — the callback URL half still lives in the
 * App Dashboard (Instagram > API setup > Configure webhooks).
 */
export async function subscribeIgApp(
  opts: { readonly accessToken: string; readonly fields?: string },
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const params = new URLSearchParams({
    subscribed_fields: opts.fields ?? IG_SUBSCRIBED_FIELDS,
    access_token: opts.accessToken,
  });
  const res = await fetchFn(`${IG_GRAPH_BASE}/${IG_GRAPH_VERSION}/me/subscribed_apps`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) await throwForIgError(res);
}
