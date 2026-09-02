import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ToolContext } from "eve/tools";

// Same isolation pattern as lib/business-store.test.ts — point the store at
// a temp dir so these tests never touch the real ~/.steve/business.json.
// Random suffix alongside the timestamp: both files derive this from
// Date.now(), and parallel vitest workers can land on the same millisecond —
// same path, same business.json, one file's writes clobbering the other's.
const TEST_DIR = join(tmpdir(), `steve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

// Must import after the mock.
const proposeAutomation = (await import("../../../agent/tools/propose_automation")).default;
const proposeAutomationUpdate = (await import("../../../agent/tools/propose_automation_update")).default;
const listAutomationsTool = (await import("../../../agent/tools/list_automations")).default;

// The tools read `ctx.session.id` for the per-agent capability check (see
// lib/agent-scope.ts). No contact exists for this id, so no agent is assigned
// to it and every capability is allowed — which is the path these tests want.
const fakeCtx = { session: { id: "test-session" } } as unknown as ToolContext;

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("propose_automation", () => {
  it("always creates a draft, never active", async () => {
    const result = await proposeAutomation.execute(
      {
        name: "Auto-reply precio",
        description: "Responde cuando preguntan por precio",
        trigger: "keyword",
        triggerValue: "precio, costo",
        channel: "whatsapp",
        steps: [{ type: "message", message: "Nuestro precio arranca en $10.000" }],
      },
      fakeCtx,
    );
    expect(result.status).toBe("draft");
    expect(result.name).toBe("Auto-reply precio");

    const { automations } = await listAutomationsTool.execute({}, fakeCtx);
    expect(automations).toHaveLength(1);
    expect(automations[0].status).toBe("draft");
    expect(automations[0].stepCount).toBe(1);
  });
});

describe("propose_automation_update", () => {
  it("updates a draft", async () => {
    const created = await proposeAutomation.execute(
      { name: "Draft", trigger: "new_chat", channel: "all", steps: [] },
      fakeCtx,
    );
    const result = await proposeAutomationUpdate.execute(
      { id: created.id, name: "Draft renombrado" },
      fakeCtx,
    );
    expect(result.ok).toBe(true);

    const { automations } = await listAutomationsTool.execute({}, fakeCtx);
    expect(automations[0].name).toBe("Draft renombrado");
  });

  it("refuses to edit an automation that's already active", async () => {
    const created = await proposeAutomation.execute(
      { name: "Live one", trigger: "new_chat", channel: "all", steps: [] },
      fakeCtx,
    );
    // Simulate the human approving it from the Automations page.
    const { updateAutomation } = await import("../../../lib/business-store");
    await updateAutomation(created.id, { status: "active" });

    const result = await proposeAutomationUpdate.execute(
      { id: created.id, name: "Sneaky rename" },
      fakeCtx,
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe("active");

    const { automations } = await listAutomationsTool.execute({}, fakeCtx);
    expect(automations[0].name).toBe("Live one");
  });

  it("reports not_found for an unknown id", async () => {
    const result = await proposeAutomationUpdate.execute({ id: "auto-nope" }, fakeCtx);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("not_found");
  });
});
