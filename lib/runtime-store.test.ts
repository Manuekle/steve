import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Same setup as lib/business-store.test.ts: point the store at a temp HOME so
// it runs on the file backend and touches nothing real. The random suffix is
// there for the same reason it is there — two parallel workers deriving a path
// from Date.now() can land on the same millisecond.
const TEST_DIR = join(tmpdir(), `senka-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_DIR };
});

const {
  appendLog,
  appendPlanSteps,
  clearLogs,
  createPlan,
  currentPlan,
  listLogs,
  listPlans,
  listSessions,
  updatePlanSteps,
} = await import("./runtime-store");

beforeEach(() => {
  delete process.env.WORKFLOW_POSTGRES_URL;
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("plans", () => {
  it("starts every step pending and derives completion rather than reporting it", async () => {
    const plan = await createPlan({
      sessionId: "s1",
      title: "Cerrar el mes",
      steps: ["Leer el pipeline", "Escribir el resumen"],
    });
    expect(plan.steps.map((step) => step.status)).toEqual(["pending", "pending"]);
    expect(plan.completedAt).toBeUndefined();

    const half = await updatePlanSteps(plan.id, [{ step: 1, status: "done", note: "12 abiertos" }]);
    // Still open: one step left. A plan that closed here would show as finished
    // while the agent was still working.
    expect(half?.completedAt).toBeUndefined();
    expect(half?.steps[0].note).toBe("12 abiertos");
    expect(half?.steps[0].endedAt).toBeTruthy();

    const done = await updatePlanSteps(plan.id, [{ step: 2, status: "done" }]);
    // Closed without a second call saying so — the agent would forget, and
    // every plan would sit "in progress" in the UI forever.
    expect(done?.completedAt).toBeTruthy();
  });

  it("accepts a step id as well as a position", async () => {
    const plan = await createPlan({ sessionId: "s2", title: "t", steps: ["a", "b"] });
    const updated = await updatePlanSteps(plan.id, [{ step: "s2", status: "failed" }]);
    expect(updated?.steps[1].status).toBe("failed");
  });

  it("ignores a step that does not exist instead of failing the call", async () => {
    // The model gets an index wrong sometimes; losing the whole update over it
    // would lose the steps it got right in the same call.
    const plan = await createPlan({ sessionId: "s3", title: "t", steps: ["a"] });
    const updated = await updatePlanSteps(plan.id, [
      { step: 9, status: "done" },
      { step: 1, status: "done" },
    ]);
    expect(updated?.steps[0].status).toBe("done");
  });

  it("marks a plan open again when work is added to a finished one", async () => {
    const plan = await createPlan({ sessionId: "s4", title: "t", steps: ["a"] });
    await updatePlanSteps(plan.id, [{ step: 1, status: "done" }]);
    const grown = await appendPlanSteps(plan.id, ["b", "c"]);
    expect(grown?.steps).toHaveLength(3);
    expect(grown?.steps.map((step) => step.id)).toEqual(["s1", "s2", "s3"]);
    expect(grown?.completedAt).toBeUndefined();
  });

  it("counts a skipped step as settled", async () => {
    const plan = await createPlan({ sessionId: "s5", title: "t", steps: ["a", "b"] });
    await updatePlanSteps(plan.id, [
      { step: 1, status: "done" },
      { step: 2, status: "skipped" },
    ]);
    expect((await listPlans("s5"))[0].completedAt).toBeTruthy();
  });

  it("hands a session the plan still open, not just the newest", async () => {
    await createPlan({ sessionId: "s6", title: "abierto", steps: ["a"] });
    const newer = await createPlan({ sessionId: "s6", title: "cerrado", steps: ["b"] });

    // While both are open the newest is the current one.
    expect((await currentPlan("s6"))?.title).toBe("cerrado");

    // Once it settles, a follow-up turn should keep ticking the one that is
    // still open rather than re-opening a finished checklist.
    await updatePlanSteps(newer.id, [{ step: 1, status: "done" }]);
    expect((await currentPlan("s6"))?.title).toBe("abierto");
  });
});

describe("logs", () => {
  it("keeps the tail newest-first and filters it", async () => {
    await appendLog({ sessionId: "a", event: "turn.started", summary: "uno" });
    await appendLog({ sessionId: "a", event: "action.result", summary: "dos", level: "error" });
    await appendLog({ sessionId: "b", event: "turn.started", summary: "tres" });

    const all = await listLogs();
    expect(all.map((entry) => entry.summary)).toEqual(["tres", "dos", "uno"]);
    expect((await listLogs({ sessionId: "a" })).map((e) => e.summary)).toEqual(["dos", "uno"]);
    expect((await listLogs({ level: "error" })).map((e) => e.summary)).toEqual(["dos"]);
    expect((await listLogs({ event: "turn." })).map((e) => e.summary)).toEqual(["tres", "uno"]);
  });

  it("includes the cursor's own millisecond, so a burst is never dropped", async () => {
    // A turn writes several lines in the same millisecond. With an exclusive
    // `since` the poll asked for what was new and was told nothing was, and
    // those lines never appeared on the page at all. Inclusive here; the
    // caller drops the repeat by id.
    await appendLog({ sessionId: "a", event: "turn.started", summary: "viejo" });
    const cursor = (await listLogs())[0].at;
    await appendLog({ sessionId: "a", event: "turn.completed", summary: "nuevo" });

    const fresh = await listLogs({ since: cursor });
    expect(fresh.map((entry) => entry.summary)).toContain("nuevo");

    // Anything strictly older is still filtered out.
    const later = new Date(Date.parse(cursor) + 1000).toISOString();
    expect(await listLogs({ since: later })).toEqual([]);
  });

  it("never throws out of a hook, whatever it is handed", async () => {
    // This runs on the turn's own path. A log write that failed a customer's
    // message would be strictly worse than a missing log line.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      appendLog({ sessionId: "a", event: "action.result", summary: "x", detail: circular }),
    ).resolves.toBeUndefined();
  });

  it("summarises sessions from the lines themselves", async () => {
    await appendLog({ sessionId: "s", event: "turn.started", summary: "arranca" });
    await appendLog({ sessionId: "s", event: "subagent.called", summary: "delega" });
    await appendLog({ sessionId: "s", event: "action.result", summary: "responde" });
    await appendLog({ sessionId: "s", event: "action.result", summary: "falla", level: "error" });
    await appendLog({ sessionId: "s", event: "turn.completed", summary: "listo" });

    const [session] = await listSessions();
    expect(session.sessionId).toBe("s");
    expect(session.toolCalls).toBe(2);
    expect(session.subagents).toBe(1);
    expect(session.errors).toBe(1);
    expect(session.status).toBe("completed");
    expect(session.lastSummary).toBe("listo");
  });

  it("calls a session that failed failed, even after a completed turn", async () => {
    await appendLog({ sessionId: "f", event: "turn.completed", summary: "ok" });
    await appendLog({ sessionId: "f", event: "turn.failed", summary: "roto", level: "error" });
    expect((await listSessions())[0].status).toBe("failed");
  });

  it("clears the tail without touching the plans", async () => {
    await createPlan({ sessionId: "c", title: "t", steps: ["a"] });
    await appendLog({ sessionId: "c", event: "turn.started", summary: "x" });
    await clearLogs();
    expect(await listLogs()).toEqual([]);
    expect(await listPlans("c")).toHaveLength(1);
  });
});
