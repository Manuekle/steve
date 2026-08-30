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
 * Throws unless `raw` is an HTTPS URL on a public host that the allowlist
 * names. `allowlistLabel` only changes the wording of the two allowlist-
 * specific errors — callers with their own fixed host list (e.g. a known
 * Slack/Discord domain) pass a label that names *that* list instead of the
 * default HTTP_ALLOWLIST credential, so the error stays accurate.
 */
export function assertSafeUrl(raw: string, allowlist: string[], allowlistLabel = "HTTP_ALLOWLIST"): URL {
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
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    throw new Error("Raw IP addresses are blocked.");
  }
  if (url.protocol === "http:") {
    throw new Error("HTTPS is required.");
  }
  if (allowlist.length === 0) {
    throw new Error(`${allowlistLabel} is empty.`);
  }
  if (!hostAllowed(host, allowlist)) {
    throw new Error(`Host ${host} is not in ${allowlistLabel}.`);
  }
  return url;
}
