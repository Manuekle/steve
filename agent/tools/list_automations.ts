import { defineTool } from "eve/tools";
import { z } from "zod";
import { listAutomations } from "../../lib/business-store";
import { assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "List existing automations (playbooks), including drafts not yet approved by a human. " +
    "Use this to find an automation's id before updating it with propose_automation_update, " +
    "or to check whether something like what the user is describing already exists.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    automations: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        status: z.string(),
        trigger: z.string(),
        triggerValue: z.string(),
        channel: z.string(),
        stepCount: z.number(),
      }),
    ),
  }),
  async execute(_input, ctx) {
    await assertToolAllowed(ctx.session.id, "list_automations");
    const list = await listAutomations();
    return {
      automations: list.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        status: a.status,
        trigger: a.trigger,
        triggerValue: a.triggerValue,
        channel: a.channel,
        stepCount: a.steps?.length ?? 0,
      })),
    };
  },
});
