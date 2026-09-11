import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { Client } from "eve/client";

// Real model calls: one new conversation followed by warm follow-up turns.
// Usage: CHAT_BENCHMARK_RUNS=3 node scripts/benchmark-chat.mjs
// Set CHAT_BENCHMARK_URL and ROUTE_AUTH_BASIC_* for an authenticated host.
const host = process.env.CHAT_BENCHMARK_URL ?? "http://127.0.0.1:3000";
const runs = Number(process.env.CHAT_BENCHMARK_RUNS ?? 3);
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 10, "CHAT_BENCHMARK_RUNS must be 1–10.");
const target = new URL(host);
assert.ok(["http:", "https:"].includes(target.protocol), "Use an HTTP(S) host.");
const username = process.env.ROUTE_AUTH_BASIC_USER?.trim();
const password = process.env.ROUTE_AUTH_BASIC_PASSWORD;
assert.equal(Boolean(username), Boolean(password), "Set both Basic auth credentials or neither.");
const auth = username && password ? { basic: { username, password } } : undefined;
assert.ok(
  !auth || target.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
  "Refusing to send Basic credentials over non-loopback HTTP.",
);

const client = new Client({ host, auth, redirect: "error", preserveCompletedSessions: true });
const health = await client.health();
assert.equal(health.status, "ready", "The Eve runtime is not ready.");
const info = await client.info();
console.log(JSON.stringify({ benchmark: "chat-first-text", host: target.origin, model: info.agent.model.id, runs }));

const session = client.session();
const samples = [];
for (let index = 0; index < runs; index++) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const sample = { turn: index + 1, kind: index === 0 ? "new-session" : "follow-up", events: 0, toolCalls: 0 };
  try {
    const response = await session.send({
      message: `Prueba técnica de latencia ${index + 1}. Respondé exactamente: Listo, estoy disponible. No uses herramientas ni consultes datos del negocio.`,
      signal: AbortSignal.timeout(90_000),
    });
    sample.acceptedMs = elapsed();
    for await (const event of response) {
      sample.events++;
      if (event.type === "turn.started") sample.turnStartedMs ??= elapsed();
      if (event.type === "step.started") sample.modelStepMs ??= elapsed();
      if (event.type === "reasoning.appended") sample.firstReasoningMs ??= elapsed();
      if (event.type === "message.appended" && event.data.messageDelta) sample.firstTextMs ??= elapsed();
      if (event.type === "actions.requested") sample.toolCalls += event.data.actions?.length ?? 0;
      if (event.type === "step.completed") sample.usage = event.data.usage;
      if (["session.waiting", "session.completed"].includes(event.type)) sample.boundary = event.type;
      if (["turn.failed", "session.failed", "turn.cancelled"].includes(event.type)) {
        throw new Error(`Benchmark stopped at ${event.type}.`);
      }
    }
    sample.totalMs = elapsed();
    assert.ok(sample.firstTextMs !== undefined, "No streamed text received.");
    assert.ok(sample.boundary, "No settled turn boundary received.");
    sample.modelStepToTextMs = sample.modelStepMs === undefined ? null : sample.firstTextMs - sample.modelStepMs;
    samples.push(sample);
    console.log(JSON.stringify(sample));
  } catch (error) {
    // Aborting the stream alone leaves server-side work running.
    let timer;
    try {
      await Promise.race([
        session.cancel(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Cancel timed out.")), 5_000); }),
      ]);
    } catch {
      console.error("Could not confirm cancellation; inspect the benchmark session in Runtime.");
    } finally {
      clearTimeout(timer);
    }
    console.error(JSON.stringify({ ...sample, totalMs: elapsed(), error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
    break;
  }
}

if (samples.length > 0) {
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  console.log(JSON.stringify({
    summary: { completed: samples.length, firstTextMedianMs: median(samples.map((sample) => sample.firstTextMs)), totalMedianMs: median(samples.map((sample) => sample.totalMs)) },
  }));
}
