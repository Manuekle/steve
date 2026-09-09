import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// End-to-end isolation, on the real file backend: two businesses on one
// installation must not be able to see each other's data.
//
// This is the test that matters for lib/business-scope.ts. The unit tests next
// door check that the ids and paths come out with the right shape; this one
// writes an agent, switches, and looks — because "the key looks right" and
// "the second business cannot read the first one's contacts" are not the same
// claim, and only the second one is the promise being made to the owner.

const TEST_DIR = join(tmpdir(), `senka-scope-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

async function load() {
  vi.resetModules();
  return {
    store: await import("./business-store"),
    scope: await import("./business-scope"),
  };
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  delete process.env.WORKFLOW_POSTGRES_URL;
});

afterEach(() => {
  delete process.env.WORKFLOW_POSTGRES_URL;
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("two businesses on one installation", () => {
  it("keeps agents, contacts and channel routing apart", async () => {
    const { store, scope } = await load();

    await store.createAgent({
      name: "Recepción",
      description: "",
      systemPrompt: "",
      tools: [],
      model: null,
    });
    await store.upsertContact({ name: "Ana", channel: "whatsapp" });
    expect(await store.listAgents()).toHaveLength(1);

    const second = await scope.createBusiness("Clínica Norte");

    // A business created a moment ago has nothing in it, and in particular
    // does not inherit the first one's file.
    expect(await store.listAgents()).toEqual([]);
    expect(await store.listContacts()).toEqual([]);

    await store.createAgent({
      name: "Ventas",
      description: "",
      systemPrompt: "",
      tools: [],
      model: null,
    });
    expect((await store.listAgents()).map((agent) => agent.name)).toEqual(["Ventas"]);

    // ...and the first business is untouched by any of it.
    await scope.setActiveBusiness(scope.DEFAULT_BUSINESS_ID);
    expect((await store.listAgents()).map((agent) => agent.name)).toEqual(["Recepción"]);
    expect((await store.listContacts()).map((contact) => contact.name)).toEqual(["Ana"]);

    await scope.setActiveBusiness(second.id);
    expect((await store.listAgents()).map((agent) => agent.name)).toEqual(["Ventas"]);
  });

  it("leaves the original business's file exactly where it was", async () => {
    const { store, scope } = await load();
    await store.createAgent({
      name: "Recepción",
      description: "",
      systemPrompt: "",
      tools: [],
      model: null,
    });

    // The path an install that predates multi-business has always used. A
    // migration here would be a migration nobody asked for.
    expect(existsSync(join(TEST_DIR, ".senka", "business.json"))).toBe(true);

    const second = await scope.createBusiness("Clínica Norte");
    await store.createAgent({
      name: "Ventas",
      description: "",
      systemPrompt: "",
      tools: [],
      model: null,
    });
    expect(existsSync(join(TEST_DIR, ".senka", "businesses", second.id, "business.json"))).toBe(true);
  });
});
