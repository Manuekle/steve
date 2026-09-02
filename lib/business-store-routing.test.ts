import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Same isolation as lib/business-store.test.ts: point the file backend at a
// temp dir so nothing here can touch the real ~/.steve/business.json.
const TEST_DIR = join(tmpdir(), `steve-routing-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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

/** The module resolves its backend once per process, so each test needs a
 *  fresh copy of it rather than a shared import. */
async function loadStore() {
  vi.resetModules();
  return import("./business-store");
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  delete process.env.WORKFLOW_POSTGRES_URL;
  hasDocument.mockReset().mockResolvedValue(true);
  readDocument.mockReset().mockResolvedValue(null);
  updateDocument.mockReset();
  migrateFromFileStore.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.WORKFLOW_POSTGRES_URL;
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("backend selection", () => {
  it("never touches the database when no connection string is set", async () => {
    const store = await loadStore();

    const contact = await store.upsertContact({ name: "Ana", channel: "whatsapp" });

    expect(contact.name).toBe("Ana");
    expect(hasDocument).not.toHaveBeenCalled();
    expect(updateDocument).not.toHaveBeenCalled();
    // The file backend really wrote, so a second read sees it.
    expect(await store.listContacts()).toHaveLength(1);
  });

  it("reads through the database when a connection string is set", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    readDocument.mockResolvedValue({ contacts: [{ id: "c1", name: "Ana" }] });
    const store = await loadStore();

    const contacts = await store.listContacts();

    expect(contacts).toEqual([{ id: "c1", name: "Ana" }]);
    expect(readDocument).toHaveBeenCalled();
  });

  it("fills in collections the stored document is missing", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    // A document written before a collection existed has no key for it; every
    // reader expects an array regardless.
    readDocument.mockResolvedValue({ contacts: [] });
    const store = await loadStore();

    expect(await store.listAutomations()).toEqual([]);
    expect(await store.listForms()).toEqual([]);
  });

  it("writes through the database's own locking, not the in-process queue", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    updateDocument.mockImplementation(
      async (_id: string, load: (raw: unknown) => unknown, fn: (s: unknown) => unknown) =>
        fn(load(null)),
    );
    const store = await loadStore();

    await store.upsertContact({ name: "Ana", channel: "whatsapp" });

    expect(updateDocument).toHaveBeenCalled();
    // Nothing was written to disk: the file backend stayed out of it.
    expect(existsSync(join(TEST_DIR, ".steve", "business.json"))).toBe(false);
  });

  // An install that has been running on the file store must not come up empty
  // the day it gets a database.
  it("imports an existing file the first time the database is empty", async () => {
    const fileStore = await loadStore();
    await fileStore.upsertContact({ name: "Ana", channel: "whatsapp" });

    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockResolvedValue(false);
    const dbStore = await loadStore();
    await dbStore.listContacts();

    expect(migrateFromFileStore).toHaveBeenCalledTimes(1);
    const imported = migrateFromFileStore.mock.calls[0][1] as { contacts: { name: string }[] };
    expect(imported.contacts[0].name).toBe("Ana");
  });

  it("does not re-import once the database holds the document", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockResolvedValue(true);
    const store = await loadStore();

    await store.listContacts();

    expect(migrateFromFileStore).not.toHaveBeenCalled();
  });

  it("has nothing to import on a fresh install with no file", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockResolvedValue(false);
    const store = await loadStore();

    await store.listContacts();

    expect(migrateFromFileStore).not.toHaveBeenCalled();
  });

  // A database that is down must not take every read down with it.
  it("falls back to the file when the database is unreachable", async () => {
    const fileStore = await loadStore();
    await fileStore.upsertContact({ name: "Ana", channel: "whatsapp" });

    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockRejectedValue(new Error("ECONNREFUSED"));
    const store = await loadStore();

    expect(await store.listContacts()).toHaveLength(1);
  });

  it("retries the database on a later call instead of caching the outage", async () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://test/steve";
    hasDocument.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockResolvedValue(true);
    readDocument.mockResolvedValue({ contacts: [{ id: "c1", name: "Ana" }] });
    const store = await loadStore();

    expect(await store.listContacts()).toEqual([]);
    expect(await store.listContacts()).toEqual([{ id: "c1", name: "Ana" }]);
  });
});
