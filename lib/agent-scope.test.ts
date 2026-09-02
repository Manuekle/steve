import { describe, it, expect, beforeEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Same isolation trick lib/business-store.test.ts uses: the store reads
// homedir() at module scope, so it has to point somewhere disposable before
// either module is imported.
const TEST_DIR = join(tmpdir(), `steve-scope-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const { createAgent, setChannelAgent, upsertContact } = await import("./business-store");
const { assertCapability, checkCapability, agentForSession } = await import("./agent-scope");

const SESSION = "sess_1";

async function seed(tools: string[]): Promise<string> {
  await upsertContact({ sessionId: SESSION, channel: "whatsapp", source: "whatsapp" });
  const agent = await createAgent({
    name: "Recepción",
    description: "",
    systemPrompt: "",
    tools,
  });
  return agent.id;
}

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("agent scope", () => {
  // Rule 1. The permissive default is the whole reason this can ship without
  // breaking an installation that never opens Mis Agentes.
  it("allows everything when no agent is assigned to the channel", async () => {
    await seed(["knowledge"]);
    expect(await agentForSession(SESSION)).toBeUndefined();
    expect(await checkCapability(SESSION, "payments")).toEqual({ allowed: true });
  });

  // Rule 2. The field held free text before; an agent whose text maps to
  // nothing must not read as "allowed to do nothing".
  it("allows everything when the assigned agent lists no capability", async () => {
    const id = await seed([]);
    await setChannelAgent("whatsapp", id);
    expect(await checkCapability(SESSION, "payments")).toEqual({ allowed: true });
  });

  it("allows only what the assigned agent lists", async () => {
    const id = await seed(["calendar", "contacts"]);
    await setChannelAgent("whatsapp", id);

    expect(await checkCapability(SESSION, "calendar")).toEqual({ allowed: true });
    const denied = await checkCapability(SESSION, "payments");
    expect(denied.allowed).toBe(false);
  });

  it("throws a sentence naming the agent when it refuses", async () => {
    const id = await seed(["calendar"]);
    await setChannelAgent("whatsapp", id);
    await expect(assertCapability(SESSION, "payments")).rejects.toThrow(/Recepción/);
    await expect(assertCapability(SESSION, "payments")).rejects.toThrow(/payments/);
  });

  it("never throws for a capability the agent has", async () => {
    const id = await seed(["payments"]);
    await setChannelAgent("whatsapp", id);
    await expect(assertCapability(SESSION, "payments")).resolves.toBeUndefined();
  });

  // Clearing the assignment has to be reachable: an agent deleted while still
  // pinned would otherwise leave the channel answering as nobody.
  it("falls back to allowing everything once the channel is cleared", async () => {
    const id = await seed(["calendar"]);
    await setChannelAgent("whatsapp", id);
    expect((await checkCapability(SESSION, "payments")).allowed).toBe(false);

    await setChannelAgent("whatsapp", null);
    expect(await checkCapability(SESSION, "payments")).toEqual({ allowed: true });
  });

  // The assignment is per channel, so an agent pinned to Instagram must not
  // scope a WhatsApp conversation.
  it("only applies to the channel the agent is assigned to", async () => {
    const id = await seed(["calendar"]);
    await setChannelAgent("instagram", id);
    expect(await checkCapability(SESSION, "payments")).toEqual({ allowed: true });
  });

  // Agents saved from a template hold tool names, not capability ids.
  it("understands an agent saved with tool names", async () => {
    const id = await seed(["upsert_contact", "transfer_human"]);
    await setChannelAgent("whatsapp", id);
    expect(await checkCapability(SESSION, "contacts")).toEqual({ allowed: true });
    expect((await checkCapability(SESSION, "payments")).allowed).toBe(false);
  });
});
