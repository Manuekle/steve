// What a connected account is actually *for*.
//
// Connecting HubSpot, Slack, Notion or Google stores a
// token — and until this module existed, nothing outside Google's own helper
// ever read one back, so the cards on /connections promised capabilities no
// code delivered. This closes that: the agent's `http_request` tool and the
// automation runner's `http_request` step now treat a connected vendor's API
// host as reachable, and attach that account's token on the way out.
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

import { OAUTH_CONNECTIONS, type OAuthConnection } from "./connections";
import { getConnectionAccessToken, getStoredConnection } from "./connection-store";

/** Exact host, or a subdomain of it. Never a suffix match on the raw string:
 *  "evil-slack.com" must not pass for "slack.com". */
function hostMatches(host: string, apiHost: string): boolean {
  const h = host.toLowerCase();
  const a = apiHost.toLowerCase();
  return h === a || h.endsWith(`.${a}`);
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
  if (!connection) return null;
  const token = await getConnectionAccessToken(connection.id);
  if (!token) return null;
  return { authorization: `Bearer ${token}`, ...(connection.apiHeaders ?? {}) };
}
