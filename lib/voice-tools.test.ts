import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Agent, AgentVoice } from "./types";

const TEST_DIR = join(tmpdir(), `senka-voice-tools-lib-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    conversationalAi = {
      tools: {
        create: (...args: unknown[]) => create(...args),
        update: (...args: unknown[]) => update(...args),
        delete: (...args: unknown[]) => remove(...args),
      },
    };
  },
}));

// Set before the import below: lib/site.ts reads the environment once, at
// module scope, so an origin assigned in `beforeEach` would arrive too late.
process.env.NEXT_PUBLIC_SITE_URL = "https://senka.example.com";

const {
  VOICE_TOOLS,
  syncVoiceTools,
  voiceSecretMatches,
  voiceToolsForAgent,
  voiceToolsSecret,
} = await import("./voice-tools");
const { saveCredentials } = await import("./credentials");

const agent = (tools: string[]): Agent =>
  ({
    id: "agent_1",
    name: "Recepción",
    description: "",
    systemPrompt: "",
    tools,
    status: "active",
    createdAt: new Date().toISOString(),
  }) as Agent;

beforeEach(async () => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  create.mockReset();
  update.mockReset();
  remove.mockReset();
  create.mockImplementation(async () => ({ id: `tool_${create.mock.calls.length}` }));
  // Both are needed before syncVoiceTools does anything: the API key to build
  // a client at all, and a public origin, because a tool ElevenLabs cannot
  // reach is worse than no tool.
  await saveCredentials({ ELEVENLABS_API_KEY: "sk_test_key_0123456789" });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("voiceToolsForAgent", () => {
  it("gives an agent with nothing picked everything", () => {
    expect(voiceToolsForAgent(agent([]))).toHaveLength(VOICE_TOOLS.length);
  });

  it("gives an agent only the tools its capabilities unlock", () => {
    const names = voiceToolsForAgent(agent(["calendar", "reminders"])).map((spec) => spec.name);
    expect(names).toEqual(["check_availability", "book_appointment", "set_reminder"]);
  });

  it("reads a stored tool name, not just a capability id", () => {
    // Agents saved before the capability picker held tool names in `tools`.
    const names = voiceToolsForAgent(agent(["upsert_contact"])).map((spec) => spec.name);
    expect(names).toEqual(["save_contact"]);
  });

  it("gives a knowledge-only agent no way to book anything", () => {
    const names = voiceToolsForAgent(agent(["knowledge"])).map((spec) => spec.name);
    expect(names).toEqual(["search_knowledge"]);
  });
});

describe("voiceToolsSecret", () => {
  it("mints one on first use and keeps it after that", async () => {
    const first = await voiceToolsSecret();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(await voiceToolsSecret()).toBe(first);
  });
});

describe("voiceSecretMatches", () => {
  it("accepts the exact secret and nothing else", () => {
    expect(voiceSecretMatches("abc", "abc")).toBe(true);
    expect(voiceSecretMatches("abd", "abc")).toBe(false);
    expect(voiceSecretMatches("ab", "abc")).toBe(false);
    expect(voiceSecretMatches(null, "abc")).toBe(false);
  });
});

describe("syncVoiceTools", () => {
  it("creates one tool per capability, pointed at this app", async () => {
    const result = await syncVoiceTools(agent(["calendar"]), {} as AgentVoice);

    expect(Object.keys(result.toolIds)).toEqual(["check_availability", "book_appointment"]);
    expect(result.warning).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(2);

    const [{ toolConfig }] = create.mock.calls[0] as [
      { toolConfig: { name: string; apiSchema: { url: string; requestHeaders: Record<string, string> } } },
    ];
    expect(toolConfig.name).toBe("check_availability");
    expect(toolConfig.apiSchema.url).toBe(
      "https://senka.example.com/api/webhooks/elevenlabs/tools/agent_1/check_availability",
    );
    expect(toolConfig.apiSchema.requestHeaders["x-senka-voice-secret"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("updates the tools a previous sync created instead of duplicating them", async () => {
    const existing = {
      toolIds: { check_availability: "tool_a", book_appointment: "tool_b" },
    } as unknown as AgentVoice;

    const result = await syncVoiceTools(agent(["calendar"]), existing);

    expect(update).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
    expect(result.toolIds).toEqual(existing.toolIds);
  });

  it("deletes the tools a narrowed capability list no longer allows", async () => {
    const existing = {
      toolIds: { check_availability: "tool_a", book_appointment: "tool_b", send_payment_link: "tool_c" },
    } as unknown as AgentVoice;

    const result = await syncVoiceTools(agent(["calendar"]), existing);

    expect(result.toolIds.send_payment_link).toBeUndefined();
    expect(remove).toHaveBeenCalledWith("tool_c");
  });

  it("re-creates a tool ElevenLabs no longer has", async () => {
    update.mockRejectedValueOnce(new Error("404 not found"));
    const existing = { toolIds: { search_knowledge: "gone" } } as unknown as AgentVoice;

    const result = await syncVoiceTools(agent(["knowledge"]), existing);

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.toolIds.search_knowledge).toBe("tool_1");
    expect(result.warning).toBeUndefined();
  });

  it("attaches nothing, and says why, when this app has no public URL", async () => {
    // A whole second module graph, because lib/site.ts freezes the origin at
    // import time — which is exactly the state a laptop running `next dev` is
    // in, and the one where a silently tool-less agent used to be created.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    vi.resetModules();
    const fresh = await import("./voice-tools");
    process.env.NEXT_PUBLIC_SITE_URL = "https://senka.example.com";

    const result = await fresh.syncVoiceTools(agent(["calendar"]), {} as AgentVoice);

    expect(result.toolIds).toEqual({});
    expect(result.warning).toContain("NEXT_PUBLIC_SITE_URL");
    expect(create).not.toHaveBeenCalled();
  });

  it("reports a total failure rather than pretending the agent has tools", async () => {
    create.mockRejectedValue(new Error("missing_permissions"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await syncVoiceTools(agent(["knowledge"]), {} as AgentVoice);

    expect(result.toolIds).toEqual({});
    expect(result.warning).toContain("ElevenAgents");
    warn.mockRestore();
  });
});
