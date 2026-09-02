import { defineDynamic, defineInstructions } from "eve/instructions";
import { agentForSession } from "../../lib/agent-scope";

// The assigned agent's own prompt.
//
// An agent is two halves: the tools it may call, and who it is. The tool half
// was wired — lib/agent-scope.ts reads `tools` and gates every call on it. The
// other half was not: `systemPrompt` reached the ElevenLabs mirror for phone
// calls and stopped there, so an operator could write a page describing a
// clinic receptionist, assign it to WhatsApp, and watch it answer questions
// about anything at all. The model had never been told who it was.
//
// Nothing here is specific to any one agent. Whatever prompt is saved on
// whichever agent the operator assigned to this channel is what gets injected;
// a sales agent tomorrow behaves like a sales agent with no change here.
//
// Ordering matters. eve combines `agent/instructions/` entries alphabetically,
// so this lands after `automations.ts` and `identity.md`. That is the right
// place for it: an active playbook is the business's instruction for this
// exact conversation, and the persona is the standing character underneath it.
// The handoff block in automations.ts stays authoritative for the same reason
// — it is a hard stop, and a persona must not talk over it.
//
// No agent assigned, or one saved with an empty prompt, adds nothing: the
// session keeps the general instructions it already had.
export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const agent = await agentForSession(ctx.session.id);
      const prompt = agent?.systemPrompt?.trim();
      if (!prompt) return;

      return defineInstructions({
        markdown: [
          "# Who you are on this channel",
          "",
          "The operator assigned this conversation to a specific agent, and the",
          "prompt below is that agent's own definition. It narrows the general",
          "instructions above: stay inside the role it describes. When someone",
          "asks for something outside it, say plainly that it is not what you",
          "handle and offer what you do — never improvise your way into an",
          "unrelated topic. An active playbook still takes precedence.",
          "",
          `## ${agent?.name ?? "Agent"}`,
          "",
          prompt,
        ].join("\n"),
      });
    },
  },
});
