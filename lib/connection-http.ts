// What a connected account is actually *for*.
//
// Connecting HubSpot, Slack, Notion or Google stores a
// token — and until this module existed, nothing outside Google's own helper
// ever read one back, so the cards on /connections promised capabilities no
// code delivered. This closes that: the agent's `http_request` tool and the
// automation runner's `http_request` step now treat a connected vendor's API
// host as reachable, and attach that account's token on the way out.
//
// The same holds for the vendors that only issue API keys (Zendesk,
// Chargebee, MailerLite): a key pasted into Settings is as much a statement
// of intent as an OAuth grant, so those hosts become reachable and carry
// their own credential too. Without this they were catalog entries and
// nothing else — the key was stored, the host stayed unreachable, and
// `http_request` refused every call the card advertised.
//
// Two rules make it safe to do automatically:
//
//   1. A token is attached only when the request host is the vendor's own API
//      host (or a subdomain of it). A prompt-injected agent that points
//      `http_request` somewhere else gets no credential — the worst it can do
//      is call an allowlisted host with no token, exactly as before.
//   2. The host must still clear `assertSafeUrl` (HTTPS, public address).
//      Connecting an account widens *which* hosts are reachable; it never
//      relaxes the SSRF guard itself.

import { OAUTH_CONNECTIONS, type ManualConnectionId, type OAuthConnection } from "./connections";
import { getConnectionAccessToken, getStoredConnection } from "./connection-store";
import { getCredential, type CredentialKey } from "./credentials";

/** Exact host, or a subdomain of it. Never a suffix match on the raw string:
 *  "evil-slack.com" must not pass for "slack.com". */
function hostMatches(host: string, apiHost: string): boolean {
  const h = host.toLowerCase();
  const a = apiHost.toLowerCase();
  return h === a || h.endsWith(`.${a}`);
}


/**
 * A vendor that authenticates with a stored API key rather than an OAuth
 * grant.
 *
 * Each entry resolves its own host, because two of the three put the
 * account's own name in it (`acme.zendesk.com`), and builds its own header,
 * because no two of them agree: Zendesk wants Basic over `email/token`,
 * Chargebee wants Basic over the key with an empty password, MailerLite wants
 * a Bearer token. A shared "attach the key somehow" helper would have to
 * guess, so the guess is written down per vendor instead.
 */
type ManualApi = {
  readonly id: ManualConnectionId;
  /** Every key must be present; a half-configured vendor stays unreachable. */
  readonly keys: readonly CredentialKey[];
  readonly host: (values: Readonly<Record<string, string>>) => string | undefined;
  readonly headers: (values: Readonly<Record<string, string>>) => Readonly<Record<string, string>>;
};

/**
 * The account's host, from whatever the operator pasted into Settings.
 *
 * They are asked for a subdomain and about as often paste the whole console
 * URL, so both are accepted — but only in the vendor's own domain. Anything
 * else returns undefined rather than a host, which keeps a typo (or a pasted
 * link to somewhere else entirely) from widening the allowlist.
 */
function vendorHost(raw: string, domain: string): string | undefined {
  const host = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase();
  if (!host) return undefined;
  if (host.endsWith(`.${domain}`)) return host;
  return /^[a-z0-9][a-z0-9-]*$/.test(host) ? `${host}.${domain}` : undefined;
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

const MANUAL_APIS: readonly ManualApi[] = [
  {
    id: "zendesk",
    keys: ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
    host: (v) => vendorHost(v.ZENDESK_SUBDOMAIN, "zendesk.com"),
    // Zendesk's API-token scheme: the username is the agent's email with a
    // literal "/token" suffix, and the token is the password.
    headers: (v) => ({ authorization: basic(`${v.ZENDESK_EMAIL}/token`, v.ZENDESK_API_TOKEN) }),
  },
  {
    id: "chargebee",
    keys: ["CHARGEBEE_SITE", "CHARGEBEE_API_KEY"],
    host: (v) => vendorHost(v.CHARGEBEE_SITE, "chargebee.com"),
    // The key is the username and the password is empty.
    headers: (v) => ({ authorization: basic(v.CHARGEBEE_API_KEY, "") }),
  },
  {
    id: "mailerlite",
    keys: ["MAILERLITE_API_KEY"],
    host: () => "connect.mailerlite.com",
    headers: (v) => ({ authorization: `Bearer ${v.MAILERLITE_API_KEY}` }),
  },
];

/** Every fully-configured key-based vendor, with the host it resolved to. */
async function resolvedManualApis(): Promise<
  ReadonlyArray<{ readonly api: ManualApi; readonly host: string; readonly values: Record<string, string> }>
> {
  const resolved: Array<{ api: ManualApi; host: string; values: Record<string, string> }> = [];
  for (const api of MANUAL_APIS) {
    const values: Record<string, string> = {};
    let complete = true;
    for (const key of api.keys) {
      const value = (await getCredential(key))?.trim();
      if (!value) {
        complete = false;
        break;
      }
      values[key] = value;
    }
    if (!complete) continue;
    const host = api.host(values);
    if (host) resolved.push({ api, host, values });
  }
  return resolved;
}

/** The vendor whose API lives on `host`, if any. */
export function connectionForHost(host: string): OAuthConnection | undefined {
  return OAUTH_CONNECTIONS.find((connection) =>
    connection.apiHosts.some((apiHost) => hostMatches(host, apiHost)),
  );
}

/**
 * API hosts reachable because an account is connected, to be merged into the
 * operator's `HTTP_ALLOWLIST`.
 *
 * Read from the stored connection rather than from `getConnectionAccessToken`:
 * this only decides whether a host is *listed*, and a token that needs a
 * refresh should not make the host disappear from the list mid-session. The
 * refresh happens later, in `connectionAuthHeaders`.
 */
export async function connectedApiHosts(): Promise<string[]> {
  const hosts: string[] = [];
  for (const connection of OAUTH_CONNECTIONS) {
    const stored = await getStoredConnection(connection.id);
    if (stored && !stored.needsReconnect) hosts.push(...connection.apiHosts);
  }
  for (const { host } of await resolvedManualApis()) hosts.push(host);
  return hosts;
}

/**
 * Headers that authenticate this request as the connected account, or `null`
 * when the host belongs to no connection or that account is not connected.
 */
export async function connectionAuthHeaders(
  host: string,
): Promise<Record<string, string> | null> {
  const connection = connectionForHost(host);
  if (connection) {
    const token = await getConnectionAccessToken(connection.id);
    if (!token) return null;
    return { authorization: `Bearer ${token}`, ...(connection.apiHeaders ?? {}) };
  }
  for (const { api, host: apiHost, values } of await resolvedManualApis()) {
    if (hostMatches(host, apiHost)) return { ...api.headers(values) };
  }
  return null;
}
