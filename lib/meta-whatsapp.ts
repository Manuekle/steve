import { MetaApiError } from "./meta-ads";

// WhatsApp Embedded Signup (one-click Meta connect) helpers.
//
// Flow: the browser opens Meta's Embedded Signup popup (FB.login with the
// WhatsApp Configuration ID), Meta returns a short-lived `code`, and this
// module trades it server-side for a business access token — the App Secret
// never leaves the server. What the popup already knows (waba_id,
// phone_number_id) arrives from the browser alongside the code; everything
// else is verified against the Graph API before anything is stored.
//
// Pure by design: `fetchFn` is injectable so the exchange and the lookups are
// unit-testable without touching Meta.

export const META_GRAPH_VERSION = "v25.0";
const META_GRAPH_BASE = "https://graph.facebook.com";

export type EmbeddedSignupExchangeInput = {
  readonly appId: string;
  readonly appSecret: string;
  readonly code: string;
};

export type EmbeddedSignupToken = {
  readonly accessToken: string;
  readonly tokenType?: string;
  /** Seconds until expiry, when Meta reports it. */
  readonly expiresIn?: number;
};

export type WabaPhoneNumber = {
  readonly id: string;
  readonly displayPhoneNumber: string;
  readonly verifiedName: string;
  readonly codeVerificationStatus?: string;
  readonly qualityRating?: string;
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

async function throwForGraphError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as GraphErrorBody;
  const err = body?.error;
  throw new MetaApiError(
    err?.error_user_msg ?? err?.message ?? `Meta API ${res.status}`,
    res.status,
    err?.code,
    err?.error_subcode,
  );
}

/**
 * Trade an Embedded Signup `code` for a business access token.
 * https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows
 */
export async function exchangeEmbeddedSignupCode(
  input: EmbeddedSignupExchangeInput,
  fetchFn: FetchFn = fetch,
): Promise<EmbeddedSignupToken> {
  if (!input.code.trim()) throw new Error("Embedded Signup code is required.");
  if (!input.appId.trim() || !input.appSecret.trim()) {
    throw new Error("Meta App ID and App Secret are required for the code exchange.");
  }
  const url =
    `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/oauth/access_token` +
    `?client_id=${encodeURIComponent(input.appId.trim())}` +
    `&client_secret=${encodeURIComponent(input.appSecret.trim())}` +
    `&code=${encodeURIComponent(input.code.trim())}`;
  const res = await fetchFn(url, { method: "GET", cache: "no-store" });
  if (!res.ok) await throwForGraphError(res);
  const body = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  if (!body.access_token) throw new Error("Meta returned no access token for the signup code.");
  return {
    accessToken: body.access_token,
    ...(body.token_type ? { tokenType: body.token_type } : {}),
    ...(typeof body.expires_in === "number" ? { expiresIn: body.expires_in } : {}),
  };
}

async function graphGet<T>(
  path: string,
  accessToken: string,
  fetchFn: FetchFn,
): Promise<T> {
  const res = await fetchFn(`${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${path}`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) await throwForGraphError(res);
  return res.json() as Promise<T>;
}

/** Phone numbers on a WhatsApp Business Account. */
export async function listWabaPhoneNumbers(
  opts: { readonly accessToken: string; readonly wabaId: string },
  fetchFn: FetchFn = fetch,
): Promise<WabaPhoneNumber[]> {
  const body = await graphGet<{ data?: WabaPhoneNumber[] }>(
    `${encodeURIComponent(opts.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
    opts.accessToken,
    fetchFn,
  );
  return body.data ?? [];
}

/** Details of a single phone number id (verifies ownership after signup). */
export async function getWabaPhoneNumber(
  opts: { readonly accessToken: string; readonly phoneNumberId: string },
  fetchFn: FetchFn = fetch,
): Promise<WabaPhoneNumber> {
  return graphGet<WabaPhoneNumber>(
    `${encodeURIComponent(opts.phoneNumberId)}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
    opts.accessToken,
    fetchFn,
  );
}

/** Subscribe this Meta App to the WABA so webhooks start flowing. */
export async function subscribeAppToWaba(
  opts: { readonly accessToken: string; readonly wabaId: string },
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const res = await fetchFn(
    `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${encodeURIComponent(opts.wabaId)}/subscribed_apps`,
    {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    },
  );
  if (!res.ok) await throwForGraphError(res);
}

/**
 * Register a phone number (PIN step) when Meta reports it as unverified.
 * Most Embedded Signup numbers arrive verified; call only when
 * `code_verification_status` says otherwise.
 */
export async function registerWabaPhoneNumber(
  opts: { readonly accessToken: string; readonly phoneNumberId: string; readonly pin?: string },
  fetchFn: FetchFn = fetch,
): Promise<void> {
  const body = new URLSearchParams({
    messaging_product: "whatsapp",
    ...(opts.pin ? { pin: opts.pin } : {}),
  });
  const res = await fetchFn(
    `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${encodeURIComponent(opts.phoneNumberId)}/register`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  if (!res.ok) await throwForGraphError(res);
}
