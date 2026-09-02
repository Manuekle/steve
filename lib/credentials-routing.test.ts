import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `steve-cred-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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

/** The backend is resolved once per process, and the sync cache lives at
 *  module scope, so each test needs its own copy of the module. */
async function loadCredentials() {
  vi.resetModules();
  return import("./credentials");
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  delete process.env.WORKFLOW_POSTGRES_URL;
  delete process.env.RESEND_API_KEY;
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
  delete process.env.RESEND_API_KEY;
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("backend selection", () => {
  it("uses the file, and no database, when no connection string is set", async () => {
    const credentials = await loadCredentials();

    await credentials.saveCredentials({ RESEND_API_KEY: "re_file" });

    expect(hasDocument).not.toHaveBeenCalled();
    expect(await credentials.getCredential("RESEND_API_KEY")).toBe("re_file");
    expect(existsSync(join(TEST_DIR, ".steve", "credentials.json"))).toBe(true);
  });

  it("reads through the database when a connection string is set", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    readDocument.mockResolvedValue({ RESEND_API_KEY: "re_db" });
    const credentials = await loadCredentials();

    expect(await credentials.getCredential("RESEND_API_KEY")).toBe("re_db");
    expect(existsSync(join(TEST_DIR, ".steve", "credentials.json"))).toBe(false);
  });

  it("imports an existing file the first time the database is empty", async () => {
    const fileMode = await loadCredentials();
    await fileMode.saveCredentials({ RESEND_API_KEY: "re_file" });

    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockResolvedValue(false);
    const dbMode = await loadCredentials();
    await dbMode.getCredential("RESEND_API_KEY");

    expect(migrateFromFileStore).toHaveBeenCalledTimes(1);
    expect(migrateFromFileStore.mock.calls[0][0]).toBe("credentials");
    expect(migrateFromFileStore.mock.calls[0][1]).toEqual({ RESEND_API_KEY: "re_file" });
  });

  it("keeps reading the file when the database is unreachable", async () => {
    const fileMode = await loadCredentials();
    await fileMode.saveCredentials({ RESEND_API_KEY: "re_file" });

    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockRejectedValue(new Error("ECONNREFUSED"));
    const dbMode = await loadCredentials();

    expect(await dbMode.getCredential("RESEND_API_KEY")).toBe("re_file");
  });
});

// The environment is the fallback on both backends, and the only thing a
// sync reader can see before anything has read asynchronously.
describe("environment fallback", () => {
  it("falls back to the environment when the database has no value", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    process.env.RESEND_API_KEY = "re_env";
    readDocument.mockResolvedValue({});
    const credentials = await loadCredentials();

    expect(await credentials.getCredential("RESEND_API_KEY")).toBe("re_env");
  });

  it("prefers a stored value over the environment", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    process.env.RESEND_API_KEY = "re_env";
    readDocument.mockResolvedValue({ RESEND_API_KEY: "re_db" });
    const credentials = await loadCredentials();

    expect(await credentials.getCredential("RESEND_API_KEY")).toBe("re_db");
  });
});

describe("sync reads in DB mode", () => {
  it("sees only the environment before the cache is warm", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    process.env.RESEND_API_KEY = "re_env";
    readDocument.mockResolvedValue({ RESEND_API_KEY: "re_db" });
    const credentials = await loadCredentials();

    expect(credentials.getCredentialSync("RESEND_API_KEY")).toBe("re_env");
  });

  // What the channel modules do at import time, and the reason
  // warmCredentialCache exists at all.
  it("sees the stored value once the cache has been warmed", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    readDocument.mockResolvedValue({ RESEND_API_KEY: "re_db" });
    const credentials = await loadCredentials();

    await credentials.warmCredentialCache();

    expect(credentials.getCredentialSync("RESEND_API_KEY")).toBe("re_db");
  });

  // In DB mode there is no file, and an absent file stamps as "" — which
  // would blank a warmed cache if the sync path still consulted it.
  it("does not let the missing file blank the warmed cache", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    readDocument.mockResolvedValue({ RESEND_API_KEY: "re_db" });
    const credentials = await loadCredentials();
    await credentials.warmCredentialCache();

    expect(credentials.getCredentialSync("RESEND_API_KEY")).toBe("re_db");
    expect(credentials.getCredentialSync("RESEND_API_KEY")).toBe("re_db");
  });

  it("warms the cache on a save too, so the next sync read is current", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    readDocument.mockResolvedValue({});
    const credentials = await loadCredentials();

    await credentials.saveCredentials({ RESEND_API_KEY: "re_saved" });

    expect(credentials.getCredentialSync("RESEND_API_KEY")).toBe("re_saved");
  });
});

describe("saving", () => {
  it("writes through the database and never touches the file", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    const credentials = await loadCredentials();

    await credentials.saveCredentials({ RESEND_API_KEY: "re_db" });

    expect(updateDocument).toHaveBeenCalled();
    expect(updateDocument.mock.calls[0][0]).toBe("credentials");
    expect(existsSync(join(TEST_DIR, ".steve", "credentials.json"))).toBe(false);
  });

  it("removes a key when saved empty, on either backend", async () => {
    const credentials = await loadCredentials();
    await credentials.saveCredentials({ RESEND_API_KEY: "re_file" });

    await credentials.saveCredentials({ RESEND_API_KEY: "" });

    expect(await credentials.getCredential("RESEND_API_KEY")).toBeUndefined();
  });
});
