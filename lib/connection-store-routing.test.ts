import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `steve-conn-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const hasDocument = vi.fn();
const readDocument = vi.fn();
const updateDocument = vi.fn();
const migrateFromFileStore = vi.fn();

vi.mock("./doc-store", () => ({
  hasDocument: (...a: unknown[]) => hasDocument(...(a as [])),
  readDocument: (...a: unknown[]) => readDocument(...(a as [])),
  updateDocument: (...a: unknown[]) => updateDocument(...(a as [])),
  migrateFromFileStore: (...a: unknown[]) => migrateFromFileStore(...(a as [])),
}));

async function loadStore() {
  vi.resetModules();
  return import("./connection-store");
}

const tokens = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: Date.now() + 3_600_000,
  scopes: ["a"],
  accountLabel: "ops@acme.com",
};

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  delete process.env.WORKFLOW_POSTGRES_URL;
  hasDocument.mockReset().mockResolvedValue(true);
  readDocument.mockReset().mockResolvedValue(null);
  updateDocument
    .mockReset()
    .mockImplementation(
      async (_id: string, load: (raw: unknown) => unknown, fn: (s: unknown) => unknown) =>
        fn(load(null)),
    );
  migrateFromFileStore.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.WORKFLOW_POSTGRES_URL;
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("backend selection", () => {
  it("round-trips a connection through the file when no database is configured", async () => {
    const store = await loadStore();

    await store.saveConnection("google", tokens);

    expect(hasDocument).not.toHaveBeenCalled();
    expect((await store.getStoredConnection("google"))?.accessToken).toBe("at");
  });

  it("reads through the database when one is configured", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    readDocument.mockResolvedValue({ google: { ...tokens, connectedAt: "2026-01-01T00:00:00Z" } });
    const store = await loadStore();

    expect((await store.getStoredConnection("google"))?.accountLabel).toBe("ops@acme.com");
    expect(readDocument.mock.calls[0][0]).toBe("connections");
  });

  it("writes through the database and leaves no token file behind", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    const store = await loadStore();

    await store.saveConnection("google", tokens);

    expect(updateDocument.mock.calls[0][0]).toBe("connections");
    expect(existsSync(join(TEST_DIR, ".steve", "connections.json"))).toBe(false);
  });

  it("imports existing tokens the first time the database is empty", async () => {
    const fileMode = await loadStore();
    await fileMode.saveConnection("google", tokens);

    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockResolvedValue(false);
    const dbMode = await loadStore();
    await dbMode.getStoredConnection("google");

    expect(migrateFromFileStore).toHaveBeenCalledTimes(1);
    const imported = migrateFromFileStore.mock.calls[0][1] as Record<string, { accessToken: string }>;
    expect(imported.google.accessToken).toBe("at");
  });

  // A database blip must not make every connected account read as
  // disconnected — the page would offer a reconnect nobody needs.
  it("keeps serving the file when the database is unreachable", async () => {
    const fileMode = await loadStore();
    await fileMode.saveConnection("google", tokens);

    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await loadStore();

    expect((await store.getStoredConnection("google"))?.accessToken).toBe("at");
  });

  it("removes a connection on the database backend too", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    const state: Record<string, unknown> = { google: { ...tokens, connectedAt: "x" } };
    readDocument.mockImplementation(async () => state);
    updateDocument.mockImplementation(
      async (_id: string, _load: (raw: unknown) => unknown, fn: (s: unknown) => unknown) => fn(state),
    );
    const store = await loadStore();

    await store.removeConnection("google");

    expect(await store.getStoredConnection("google")).toBeUndefined();
  });
});
