import { join } from "node:path";
import { homedir } from "node:os";
import { createDocumentStore } from "./doc-store";
import type {
  ChannelId,
  RunPlan,
  RunStep,
  RunStepStatus,
  RuntimeLogEntry,
  RuntimeLogLevel,
} from "./types";

// What the runtime did, kept where somebody can read it afterwards.
//
// Eve already streams every turn as NDJSON on
// /eve/v1/session/:id/stream — but a stream only exists while a client is
// attached to it. The turns that most need explaining are exactly the ones
// nobody was watching: a WhatsApp message at 3am, a schedule that fired, a
// tool that failed twice and then succeeded. agent/hooks/runtime-log.ts
// subscribes to those same events inside the runtime and writes them here.
//
// Two collections, because they answer two different questions:
//
//   logs  — *what happened*, newest first, capped. A tail, not an archive:
//           the point is the last few hundred events, and an unbounded log
//           inside a single JSON document is a store that gets slower every
//           day until it stops.
//   plans — *what the agent set out to do*, from the `plan` tool. Kept per
//           session and much smaller, so it survives longer than the log
//           lines that produced it.

const STORE_FILE = join(homedir(), ".senka", "runtime.json");

/** How many log lines to keep. Roughly a day of a busy install, and small
 *  enough that reading the whole document stays cheap. */
const MAX_LOGS = 600;

/** How many plans to keep. One per multi-step run. */
const MAX_PLANS = 60;

type RuntimeStore = {
  logs: RuntimeLogEntry[];
  plans: RunPlan[];
};

function empty(): RuntimeStore {
  return { logs: [], plans: [] };
}

function normalize(parsed: Partial<RuntimeStore>): RuntimeStore {
  return { logs: parsed.logs ?? [], plans: parsed.plans ?? [] };
}

const store = createDocumentStore<RuntimeStore>({
  id: "runtime",
  file: STORE_FILE,
  empty,
  normalize,
  scoped: true,
});

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Long payloads are useful and unbounded. Clipped at a size that still shows
 *  the shape of a tool's arguments. */
function clip(value: unknown, max = 800): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : safeJson(value);
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export type AppendLogInput = {
  readonly sessionId: string;
  readonly turnId?: string;
  readonly event: string;
  readonly summary: string;
  readonly level?: RuntimeLogLevel;
  readonly subject?: string;
  readonly channel?: ChannelId;
  readonly detail?: unknown;
  readonly durationMs?: number;
};

/**
 * Append one line.
 *
 * Never throws to its caller. This runs inside a hook on the turn's own path,
 * and a log write that fails a customer's message would be a strictly worse
 * outcome than a missing log line.
 */
export async function appendLog(input: AppendLogInput): Promise<void> {
  try {
    await store.update((current) => {
      const entry: RuntimeLogEntry = {
        id: newId("log"),
        at: nowIso(),
        sessionId: input.sessionId,
        ...(input.turnId ? { turnId: input.turnId } : {}),
        level: input.level ?? "info",
        event: input.event,
        summary: input.summary,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.channel ? { channel: input.channel } : {}),
        ...(clip(input.detail) ? { detail: clip(input.detail) } : {}),
        ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      };
      current.logs = [entry, ...current.logs].slice(0, MAX_LOGS);
    });
  } catch {
    // Observability is never worth a failed turn.
  }
}

export type LogQuery = {
  readonly sessionId?: string;
  readonly level?: RuntimeLogLevel;
  readonly event?: string;
  readonly channel?: ChannelId;
  /**
   * Lines at or after this ISO timestamp — how the runtime page polls without
   * re-reading the whole tail every few seconds.
   *
   * Inclusive, deliberately. A burst writes several lines in the same
   * millisecond (`actions.requested`, `action.result` and `step.completed`
   * routinely land together), so an exclusive `>` silently dropped every line
   * that shared a millisecond with the cursor — the client asked for what was
   * new and was told nothing was. The cursor's own line comes back instead,
   * and the caller drops it by id.
   */
  readonly since?: string;
  readonly limit?: number;
};

export async function listLogs(query: LogQuery = {}): Promise<RuntimeLogEntry[]> {
  const logs = (await store.read()).logs;
  const filtered = logs.filter((entry) => {
    if (query.sessionId && entry.sessionId !== query.sessionId) return false;
    if (query.level && entry.level !== query.level) return false;
    if (query.event && !entry.event.startsWith(query.event)) return false;
    if (query.channel && entry.channel !== query.channel) return false;
    if (query.since && entry.at < query.since) return false;
    return true;
  });
  return filtered.slice(0, query.limit ?? 200);
}

export async function clearLogs(): Promise<void> {
  await store.update((current) => {
    current.logs = [];
  });
}

/** One row per session in the log tail: who ran, when, how it ended. The
 *  runtime page's session list, computed rather than stored so it can never
 *  disagree with the lines it summarises. */
export type RuntimeSessionSummary = {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly lastAt: string;
  readonly channel?: ChannelId;
  readonly events: number;
  readonly errors: number;
  readonly toolCalls: number;
  readonly subagents: number;
  readonly status: "running" | "completed" | "failed";
  readonly lastSummary: string;
};

export async function listSessions(limit = 25): Promise<RuntimeSessionSummary[]> {
  const logs = (await store.read()).logs;
  const bySession = new Map<string, RuntimeLogEntry[]>();
  for (const entry of logs) {
    const existing = bySession.get(entry.sessionId);
    if (existing) existing.push(entry);
    else bySession.set(entry.sessionId, [entry]);
  }

  const summaries: RuntimeSessionSummary[] = [];
  for (const [sessionId, entries] of bySession) {
    // `logs` is newest-first, so entries[0] is the latest for this session.
    const latest = entries[0];
    const oldest = entries[entries.length - 1];
    const failed = entries.some((e) => e.event === "turn.failed" || e.event === "session.failed");
    const settled = entries.some(
      (e) =>
        e.event === "session.waiting" ||
        e.event === "session.completed" ||
        e.event === "turn.completed",
    );
    summaries.push({
      sessionId,
      startedAt: oldest.at,
      lastAt: latest.at,
      ...(latest.channel ? { channel: latest.channel } : {}),
      events: entries.length,
      errors: entries.filter((e) => e.level === "error").length,
      toolCalls: entries.filter((e) => e.event === "action.result").length,
      subagents: entries.filter((e) => e.event === "subagent.called").length,
      status: failed ? "failed" : settled ? "completed" : "running",
      lastSummary: latest.summary,
    });
  }
  return summaries.sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, limit);
}

// ── Plans ─────────────────────────────────────────────────────────

export async function listPlans(sessionId?: string): Promise<RunPlan[]> {
  const plans = (await store.read()).plans;
  return sessionId ? plans.filter((plan) => plan.sessionId === sessionId) : plans;
}

export async function getPlan(id: string): Promise<RunPlan | undefined> {
  return (await store.read()).plans.find((plan) => plan.id === id);
}

/** The session's current plan — the newest one that still has open steps, and
 *  otherwise the newest one at all. */
export async function currentPlan(sessionId: string): Promise<RunPlan | undefined> {
  const plans = (await store.read()).plans.filter((plan) => plan.sessionId === sessionId);
  const open = plans.find((plan) => !plan.completedAt);
  return open ?? plans[0];
}

export async function createPlan(input: {
  readonly sessionId: string;
  readonly title: string;
  readonly steps: readonly string[];
}): Promise<RunPlan> {
  return store.update((current) => {
    const at = nowIso();
    const plan: RunPlan = {
      id: newId("plan"),
      sessionId: input.sessionId,
      title: input.title.trim() || "Plan",
      steps: input.steps.map((title, index) => ({
        id: `s${index + 1}`,
        title: title.trim(),
        status: "pending" as RunStepStatus,
      })),
      createdAt: at,
      updatedAt: at,
    };
    current.plans = [plan, ...current.plans].slice(0, MAX_PLANS);
    return plan;
  });
}

export type StepUpdate = {
  /** Either the step's id (`s2`) or its 1-based position. Both, because the
   *  model reliably knows the position and only sometimes echoes the id back. */
  readonly step: string | number;
  readonly status: RunStepStatus;
  readonly note?: string;
};

/**
 * Mark steps, and close the plan when nothing is left open.
 *
 * A plan whose last step is marked done should not need a second call to say
 * so — the agent would forget, and every plan would sit "in progress" forever
 * in the UI. Completion is derived, not reported.
 */
export async function updatePlanSteps(
  planId: string,
  updates: readonly StepUpdate[],
): Promise<RunPlan | undefined> {
  return store.update((current) => {
    const existing = current.plans.find((plan) => plan.id === planId);
    if (!existing) return undefined;

    const at = nowIso();
    let steps = [...existing.steps];
    for (const update of updates) {
      const index =
        typeof update.step === "number"
          ? update.step - 1
          : steps.findIndex((step) => step.id === update.step);
      if (index < 0 || index >= steps.length) continue;
      const step = steps[index];
      const next: RunStep = {
        ...step,
        status: update.status,
        ...(update.note !== undefined ? { note: update.note } : {}),
        ...(update.status === "running" && !step.startedAt ? { startedAt: at } : {}),
        ...(update.status === "done" || update.status === "failed" || update.status === "skipped"
          ? { endedAt: at }
          : {}),
      };
      steps = steps.map((entry, i) => (i === index ? next : entry));
    }

    const open = steps.some((step) => step.status === "pending" || step.status === "running");
    const updated: RunPlan = {
      ...existing,
      steps,
      updatedAt: at,
      ...(open ? { completedAt: undefined } : { completedAt: at }),
    };
    current.plans = current.plans.map((plan) => (plan.id === planId ? updated : plan));
    return updated;
  });
}

/** Add steps to a plan already in flight — what happens when the work turns
 *  out to be bigger than it looked. */
export async function appendPlanSteps(
  planId: string,
  titles: readonly string[],
): Promise<RunPlan | undefined> {
  return store.update((current) => {
    const existing = current.plans.find((plan) => plan.id === planId);
    if (!existing) return undefined;
    const at = nowIso();
    const added: RunStep[] = titles.map((title, index) => ({
      id: `s${existing.steps.length + index + 1}`,
      title: title.trim(),
      status: "pending",
    }));
    const updated: RunPlan = {
      ...existing,
      steps: [...existing.steps, ...added],
      updatedAt: at,
      completedAt: undefined,
    };
    current.plans = current.plans.map((plan) => (plan.id === planId ? updated : plan));
    return updated;
  });
}
