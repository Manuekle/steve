// MCP naming and URL rules, with no server imports.
//
// Split out of lib/mcp-store.ts for the same reason lib/phone-format.ts was
// split out of the number store: that module reaches `doc-store` →
// `postgres-pool` → `pg`, and a client component importing one pure function
// from it drags the Postgres driver into the browser bundle.
//
// The connect form needs both of these while you type — the slug to preview
// the tool name, the URL rule to refuse a plaintext endpoint before the round
// trip — and it needs to say so in the reader's own language, which is why the
// failure comes back as a dictionary key rather than a sentence.

/** A slug that can be half of a tool name. The model calls `mcp_<slug>`, and a
 *  tool name with a dash or an accent in it is one some providers refuse. */
export function slugifyServer(name: string): string {
  const folded = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = folded
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return slug || "server";
}

/** Why a URL was refused. A key, not a sentence: this runs on the server (at
 *  the API boundary) and in the browser (as you type), and only one of those
 *  two knows what language the reader is in. */
export type McpUrlError = "mcp.urlInvalid" | "mcp.urlInsecure" | "mcp.urlScheme";

export type McpUrlResult = { readonly url: string } | { readonly error: McpUrlError };

/**
 * A server URL we are willing to talk to.
 *
 * `http:` is allowed only for loopback. Everything else has to be TLS: an MCP
 * connection carries a bearer token on every request, and sending one over
 * plaintext to a host on the internet hands it to whoever is between.
 */
export function validateMcpUrl(raw: string): McpUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { error: "mcp.urlInvalid" };
  }
  if (parsed.protocol === "https:") return { url: parsed.toString() };
  if (parsed.protocol === "http:") {
    const host = parsed.hostname;
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    if (local) return { url: parsed.toString() };
    return { error: "mcp.urlInsecure" };
  }
  return { error: "mcp.urlScheme" };
}
