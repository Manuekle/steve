import { defineTool } from "eve/tools";
import { z } from "zod";
import { listAutomations, updateAutomation } from "../../lib/business-store";
import { workflowStepSchema, toWorkflowSteps } from "../../lib/workflow-schema";

export default defineTool({
  description:
    "Revise a DRAFT automation you or the user previously created in this chat (find its id " +
    "with list_automations). Refuses anything not currently a draft — an active or paused " +
    "automation has already been approved and may be running; tell the user to pause it in " +
    "the Automations page first if it genuinely needs changes.",
  inputSchema: z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    trigger: z.enum(["keyword", "schedule", "new_chat", "no_reply"]).optional(),
    triggerValue: z.string().optional(),
    channel: z.enum(["web", "whatsapp", "messenger", "instagram", "all"]).optional(),
    steps: z.array(workflowStepSchema).optional().describe("Replaces the entire step list when provided."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.string(),
    message: z.string(),
  }),
  async execute({ id, name, description, trigger, triggerValue, channel, steps }) {
    const existing = (await listAutomations()).find((a) => a.id === id);
    if (!existing) {
      return { ok: false, status: "not_found", message: `No automation with id ${id}.` };
    }
    if (existing.status !== "draft") {
      return {
        ok: false,
        status: existing.status,
        message: `"${existing.name}" is ${existing.status}, not a draft — it's already been approved. Ask the user to pause it in the Automations page before you can propose further edits.`,
      };
    }

    await updateAutomation(id, {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
      ...(triggerValue !== undefined ? { triggerValue } : {}),
      ...(channel !== undefined ? { channel } : {}),
      ...(steps !== undefined ? { steps: toWorkflowSteps(steps) } : {}),
    });

    return { ok: true, status: "draft", message: "Draft updated. Still inactive until the user approves it." };
  },
});
