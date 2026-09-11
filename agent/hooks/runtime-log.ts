import { defineHook } from "eve/hooks";
import { appendLog } from "../../lib/runtime-store";
import { channelFromKind } from "../../lib/business-store";

// The runtime's flight recorder.
//
// Eve already publishes every one of these events on
// /eve/v1/session/:id/stream, and the chat UI reads them live. The gap this
// closes is everything that runs with nobody attached: a WhatsApp message at
// 3am, a schedule firing, a subagent three levels down. Those turns produced
// no record anybody could read afterwards — the first question after a bad
// answer, "what did it actually do", had no answer at all.
//
// So the same events are written to lib/runtime-store.ts as they pass. What
// is recorded is deliberately not everything:
//
//   - **No message bodies.** `message.appended` fires per token and
//     `message.completed` carries the full reply; both are already mirrored
//     into the conversation store by agent/hooks/persist.ts, and duplicating
//     customer text into a second store is a second place it has to be
//     deleted from. This log records *shape* — which tool, which subagent,
//     how long, did it fail — not content.
//   - **No tool arguments in full.** Clipped by the store, because a tool
//     input can carry a phone number or an address.
//
// Every handler is wrapped: a hook that throws takes the turn with it, and an
// observability write is never worth a customer's message.

/**
 * Tool inputs and results carry customer data. The log keeps enough to
 * recognise the call and nothing more.
 *
 * A string is summarised by its length, not truncated. Truncating looks
 * harmless until the thing being truncated is a subagent's draft reply or a
 * knowledge passage — the first 120 characters of those is still the customer's
 * data, in a second store with its own retention.
 */
function shape(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    return value.length > 0 ? `${value.length} caracteres` : undefined;
  }
  if (typeof value !== "object") return String(value).slice(0, 40);
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) return undefined;
  return keys.slice(0, 12).join(", ");
}

function errorText(value: unknown): string {
  if (!value) return "sin detalle";
  if (typeof value === "string") return value;
  const message = (value as { message?: unknown }).message;
  if (typeof message === "string") return message;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" ? code : "sin detalle";
}

export default defineHook({
  events: {
    async "turn.started"(event, ctx) {
      await appendLog({
        sessionId: ctx.session.id,
        turnId: event.data?.turnId,
        event: "turn.started",
        summary: "Turno iniciado",
        channel: channelFromKind(ctx.channel.kind),
      });
    },

    async "actions.requested"(event, ctx) {
      // One line per requested call, before any of them run. This is the
      // event that makes a stuck turn legible: the tool appears here and its
      // `action.result` never arrives.
      const actions = (event.data as { actions?: unknown })?.actions;
      const list = Array.isArray(actions) ? actions : [];
      for (const action of list) {
        const name = (action as { toolName?: unknown; name?: unknown })?.toolName;
        const toolName =
          typeof name === "string"
            ? name
            : typeof (action as { name?: unknown })?.name === "string"
              ? ((action as { name: string }).name)
              : "acción";
        await appendLog({
          sessionId: ctx.session.id,
          turnId: event.data?.turnId,
          event: "actions.requested",
          subject: toolName,
          summary: `Llamando ${toolName}`,
          channel: channelFromKind(ctx.channel.kind),
          detail: shape((action as { input?: unknown })?.input),
        });
      }
    },

    async "action.result"(event, ctx) {
      // The payload nests: `data.result` carries `{ toolName, output, … }`,
      // while `turnId` and `status` sit on `data` itself. Reading `toolName`
      // off the top level — the shape the docs table implies — silently
      // labelled every tool call "acción" and lost the failure flag with it.
      const data = event.data as {
        result?: {
          kind?: unknown;
          toolName?: unknown;
          /** A delegation result names the child here, not in `toolName`. */
          subagentName?: unknown;
          isError?: unknown;
          error?: unknown;
          output?: unknown;
        };
        toolName?: unknown;
        status?: unknown;
        error?: unknown;
        turnId?: string;
      };
      const result = data?.result ?? {};
      const name = result.toolName ?? result.subagentName ?? data?.toolName;
      const toolName = typeof name === "string" ? name : "acción";
      const failed =
        result.isError === true || !!result.error || !!data?.error || data?.status === "failed";
      await appendLog({
        sessionId: ctx.session.id,
        turnId: data?.turnId,
        event: "action.result",
        level: failed ? "error" : "info",
        subject: toolName,
        summary: failed ? `${toolName} falló` : `${toolName} respondió`,
        channel: channelFromKind(ctx.channel.kind),
        detail: failed ? errorText(result.error ?? data?.error) : shape(result.output),
      });
    },

    // Only the start. `subagent.completed` fires immediately before the
    // delegation's own `action.result`, carries no name of its own (just a
    // callId and the output), and would put two lines on the log for one
    // finish. The `action.result` handler below reads `subagentName` and
    // closes the pair the same way it does for a tool.
    async "subagent.called"(event, ctx) {
      const data = event.data as {
        name?: unknown;
        childSessionId?: unknown;
        turnId?: string;
      };
      const name = typeof data?.name === "string" ? data.name : "subagente";
      await appendLog({
        sessionId: ctx.session.id,
        turnId: data?.turnId,
        event: "subagent.called",
        subject: name,
        summary: `Delegado a ${name}`,
        channel: channelFromKind(ctx.channel.kind),
        // The child publishes its own stream; recording the id is what lets
        // the runtime page offer a link into it.
        detail:
          typeof data?.childSessionId === "string" ? `session ${data.childSessionId}` : undefined,
      });
    },

    async "step.completed"(event, ctx) {
      const data = event.data as {
        finishReason?: unknown;
        usage?: { inputTokens?: number; outputTokens?: number };
        turnId?: string;
        stepIndex?: number;
      };
      const usage = data?.usage;
      await appendLog({
        sessionId: ctx.session.id,
        turnId: data?.turnId,
        event: "step.completed",
        summary: `Paso ${((data?.stepIndex ?? 0) as number) + 1} — ${String(data?.finishReason ?? "fin")}`,
        channel: channelFromKind(ctx.channel.kind),
        detail: usage
          ? `in ${usage.inputTokens ?? 0} / out ${usage.outputTokens ?? 0} tokens`
          : undefined,
      });
    },

    async "step.failed"(event, ctx) {
      await appendLog({
        sessionId: ctx.session.id,
        turnId: event.data?.turnId,
        event: "step.failed",
        level: "error",
        summary: `Paso fallido: ${errorText(event.data)}`,
        channel: channelFromKind(ctx.channel.kind),
        detail: errorText(event.data),
      });
    },

    async "authorization.required"(event, ctx) {
      const data = event.data as { name?: unknown; turnId?: string };
      const name = typeof data?.name === "string" ? data.name : "conexión";
      await appendLog({
        sessionId: ctx.session.id,
        turnId: data?.turnId,
        event: "authorization.required",
        level: "warn",
        subject: name,
        summary: `${name} necesita autorización OAuth`,
        channel: channelFromKind(ctx.channel.kind),
      });
    },

    async "turn.failed"(event, ctx) {
      await appendLog({
        sessionId: ctx.session.id,
        turnId: event.data?.turnId,
        event: "turn.failed",
        level: "error",
        summary: `Turno fallido: ${errorText(event.data)}`,
        channel: channelFromKind(ctx.channel.kind),
        detail: errorText(event.data),
      });
    },

    async "turn.completed"(event, ctx) {
      await appendLog({
        sessionId: ctx.session.id,
        turnId: event.data?.turnId,
        event: "turn.completed",
        summary: "Turno completado",
        channel: channelFromKind(ctx.channel.kind),
      });
    },
  },
});
