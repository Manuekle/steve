import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "./doc-store";
import { slugifyServer, validateMcpUrl, type McpUrlError } from "./mcp-url";
import type { McpAuthKind, McpCheck, McpServer } from "./types";

// Remote MCP servers the owner has connected.
//
// This store holds live credentials — a bearer token for somebody's Linear or
// Notion workspace is exactly as sensitive as the OAuth tokens in
// connections.json — so the file is 0600 and `secret` never crosses the API
// boundary. `listPublicServers` is what the browser gets; the raw record only
// ever leaves this module towards the MCP client.

const STORE_FILE = join(homedir(), ".senka", "mcp-servers.json");

type McpStore = {
  servers: McpServer[];
};

const AUTH_KINDS: readonly McpAuthKind[] = ["none", "bearer", "header"];

function empty(): McpStore {
  return { servers: [] };
}

function normalize(parsed: Partial<McpStore>): McpStore {
  return { servers: parsed.servers ?? [] };
}

const store = createDocumentStore<McpStore>({
  id: "mcp-servers",
  file: STORE_FILE,
  empty,
  normalize,
  // Same reasoning as lib/credentials.ts: the bytes are a secret at rest.
  fileMode: 0o600,
  scoped: true,
});

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Naming and URL rules live in lib/mcp-url.ts so the connect form can use them
// while you type without pulling `pg` into the browser bundle. Re-exported
// because every server caller wants them from this module.
export { slugifyServer, validateMcpUrl } from "./mcp-url";
export type { McpUrlError, McpUrlResult } from "./mcp-url";

function uniqueSlug(existing: readonly McpServer[], name: string, ignoreId?: string): string {
  const base = slugifyServer(name);
  const taken = new Set(existing.filter((s) => s.id !== ignoreId).map((s) => s.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

function readAuthKind(value: unknown): McpAuthKind {
  return AUTH_KINDS.includes(value as McpAuthKind) ? (value as McpAuthKind) : "none";
}

/** Tool filters arrive either as an array (the API) or as the comma-separated
 *  string the form holds. Both normalize to a deduplicated list. */
function readList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim()),
      ),
    ];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean))];
  }
  return [];
}

/** The browser-safe projection: everything except the secret, plus a flag
 *  saying whether one is stored so the form can render "•••• guardado". */
export type PublicMcpServer = Omit<McpServer, "secret"> & { readonly hasSecret: boolean };

export function toPublic(server: McpServer): PublicMcpServer {
  const { secret, ...rest } = server;
  return { ...rest, hasSecret: !!secret };
}

export async function listServers(): Promise<McpServer[]> {
  return (await store.read()).servers;
}

export async function listPublicServers(): Promise<PublicMcpServer[]> {
  return (await store.read()).servers.map(toPublic);
}

export async function getServer(id: string): Promise<McpServer | undefined> {
  return (await store.read()).servers.find((server) => server.id === id);
}

/** Only the enabled ones, which is what the runtime lowers into tools. */
export async function activeServers(): Promise<McpServer[]> {
  return (await store.read()).servers.filter((server) => server.enabled);
}

export type CreateServerInput = {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly authKind?: unknown;
  readonly secret?: string;
  readonly headerName?: string;
  readonly enabled?: boolean;
  readonly allow?: unknown;
  readonly block?: unknown;
};

/** A failure the caller has to render. Always a dictionary key so the API and
 *  the form can say the same thing in the reader's own language. */
export type ServerError = McpUrlError | "mcp.missingToken" | "mcp.missingHeader" | "not_found";

export type ServerResult =
  | { readonly ok: true; readonly server: McpServer }
  | { readonly ok: false; readonly error: ServerError };

export async function createServer(input: CreateServerInput): Promise<ServerResult> {
  const url = validateMcpUrl(input.url);
  if ("error" in url) return { ok: false, error: url.error };

  const authKind = readAuthKind(input.authKind);
  if (authKind !== "none" && !input.secret?.trim()) {
    return { ok: false, error: "mcp.missingToken" };
  }
  if (authKind === "header" && !input.headerName?.trim()) {
    return { ok: false, error: "mcp.missingHeader" };
  }

  return store.update((current) => {
    const at = nowIso();
    const name = input.name.trim() || "Servidor MCP";
    const created: McpServer = {
      id: newId(),
      slug: uniqueSlug(current.servers, name),
      name,
      url: url.url,
      description: input.description?.trim() ?? "",
      authKind,
      ...(input.secret?.trim() ? { secret: input.secret.trim() } : {}),
      ...(input.headerName?.trim() ? { headerName: input.headerName.trim() } : {}),
      enabled: input.enabled !== false,
      allow: readList(input.allow),
      block: readList(input.block),
      createdAt: at,
      updatedAt: at,
    };
    current.servers = [created, ...current.servers];
    return { ok: true as const, server: created };
  });
}

export async function updateServer(
  id: string,
  updates: Partial<CreateServerInput>,
): Promise<ServerResult> {
  let nextUrl: string | undefined;
  if (updates.url !== undefined) {
    const parsed = validateMcpUrl(updates.url);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    nextUrl = parsed.url;
  }

  return store.update((current) => {
    const existing = current.servers.find((server) => server.id === id);
    if (!existing) return { ok: false as const, error: "not_found" as const };
    const name = updates.name?.trim() || existing.name;
    const updated: McpServer = {
      ...existing,
      name,
      slug: name === existing.name ? existing.slug : uniqueSlug(current.servers, name, id),
      ...(nextUrl ? { url: nextUrl } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(updates.authKind !== undefined ? { authKind: readAuthKind(updates.authKind) } : {}),
      // An absent `secret` keeps the stored one: the form never receives the
      // value, so a save that echoed back an empty field would silently
      // disconnect a working server. An explicit empty string clears it.
      ...(updates.secret === undefined
        ? {}
        : updates.secret.trim()
          ? { secret: updates.secret.trim() }
          : { secret: undefined }),
      ...(updates.headerName !== undefined
        ? { headerName: updates.headerName.trim() || undefined }
        : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
      ...(updates.allow !== undefined ? { allow: readList(updates.allow) } : {}),
      ...(updates.block !== undefined ? { block: readList(updates.block) } : {}),
      updatedAt: nowIso(),
    };
    current.servers = current.servers.map((server) => (server.id === id ? updated : server));
    return { ok: true as const, server: updated };
  });
}

export async function recordCheck(id: string, check: McpCheck): Promise<void> {
  await store.update((current) => {
    current.servers = current.servers.map((server) =>
      server.id === id ? { ...server, lastCheck: check } : server,
    );
  });
}

export async function deleteServer(id: string): Promise<boolean> {
  return store.update((current) => {
    const before = current.servers.length;
    current.servers = current.servers.filter((server) => server.id !== id);
    return current.servers.length < before;
  });
}
