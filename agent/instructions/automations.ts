import { defineDynamic, defineInstructions } from "eve/instructions";
import { automationsForAgent, formatPlaybook } from "../../lib/automation-engine";
import { agentForSession } from "../../lib/agent-scope";
import { getContactBySession, listAutomations } from "../../lib/business-store";

const HANDOFF_BLOCK = `# Human handoff active

This contact has been transferred to a human teammate. Your role here is strictly limited:

1. Reply with EXACTLY this message (translate if the user's language differs):
   "Un compañero del equipo te atenderá en breve. Gracias por tu paciencia."
2. Do NOT call any tools.
3. Do NOT ask questions or continue the conversation.
4. Do NOT qualify the lead or gather information.
5. If the user sends another message, repeat step 1.

This is a hard rule. No exceptions.`;

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const [automations, contact, agent] = await Promise.all([
        listAutomations(),
        getContactBySession(ctx.session.id),
        agentForSession(ctx.session.id),
      ]);

      // Hard-block: contact is in human handoff — override all instructions.
      if (contact?.status === "waiting_human") {
        return defineInstructions({ markdown: HANDOFF_BLOCK });
      }

      // Only this agent's playbooks. An automation assigned to another agent
      // used to be injected here anyway, so every agent followed every flow.
      return defineInstructions({
        markdown: formatPlaybook(automationsForAgent(automations, agent?.id), contact),
      });
    },
  },
});
