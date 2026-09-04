// SSRF guard shared by the agent's http_request tool and the server-side
// automation runner. Both call out to third-party endpoints on a person's
// behalf, so both must apply exactly the same rules — keeping one copy is
// the point of this module.

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|metadata\.google\.internal|172\.(1[6-9]|2\d|3[01])\.)/i;
const PRIVATE_V6 = /^(::1|fd[0-9a-f]{2}:|fe80:)/i;

export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[, \n]+/)
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

export function hostAllowed(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

/**
 * Whether the host is an IP address rather than a name, in any of the spellings
 * a browser and `fetch` accept.
 *
 * The dotted-quad regex this replaces was the only check, and it is the one
 * spelling an attacker would not use. `http://2130706433/` is 127.0.0.1 in
 * decimal, `http://0x7f000001/` in hex, `http://0177.0.0.1/` in octal, and
 * `[::ffff:127.0.0.1]` is the v6-mapped form — none of them match a
 * dotted-quad, and all of them resolve. `URL` strips the brackets from a v6
 * literal, so `hostname` is the bare address by the time it reaches here.
 *
 * Reachable through `assertPublicHttpsUrl`, which the agent's `http_request`
 * tool does *not* use on its own — that path also has to clear the allowlist,
 * so this was never the last line of defence there. It is the only one for a
 * webhook URL a signed-in operator types in.
 */
function isIpLiteral(host: string): boolean {
  if (host.includes(":")) return true; // any v6 literal, mapped forms included
  const labels = host.split(".");
  if (labels.length > 4 || labels.some((label) => label === "")) return false;
  // Every label numeric in some base — decimal, 0x hex or 0-prefixed octal —
  // is how the shortened forms (`10.1`, `0x7f000001`) are written.
  return labels.every((label) => /^(0[xX][0-9a-fA-F]+|[0-9]+)$/.test(label));
}

/**
 * Throws unless `raw` is an HTTPS URL on a public host that the allowlist
 * names. `allowlistLabel` only changes the wording of the two allowlist-
 * specific errors — callers with their own fixed host list (e.g. a known
 * Slack/Discord domain) pass a label that names *that* list instead of the
 * default HTTP_ALLOWLIST credential, so the error stays accurate.
 */
export function assertSafeUrl(raw: string, allowlist: string[], allowlistLabel = "HTTP_ALLOWLIST"): URL {
  const url = assertPublicHttpsUrl(raw);
  if (allowlist.length === 0) {
    throw new Error(`${allowlistLabel} is empty.`);
  }
  if (!hostAllowed(url.hostname, allowlist)) {
    throw new Error(`Host ${url.hostname} is not in ${allowlistLabel}.`);
  }
  return url;
}

/**
 * Every rule `assertSafeUrl` applies except the allowlist: HTTPS only, no
 * loopback or private range, no raw IP literal. For destinations a signed-in
 * operator types in themselves — a form's own webhook — where there is no
 * fixed host list to check against, but the SSRF rules still hold.
 *
 * Deliberately not folded into `assertSafeUrl`: an empty allowlist there means
 * "deny", which is what keeps the agent's `http_request` tool shut by default.
 */
export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  const host = url.hostname;
  if (PRIVATE_HOST.test(host) || PRIVATE_V6.test(host)) {
    throw new Error("Private or loopback hosts are blocked.");
  }
  if (isIpLiteral(host)) {
    throw new Error("Raw IP addresses are blocked.");
  }
  if (url.protocol === "http:") {
    throw new Error("HTTPS is required.");
  }
  return url;
}
