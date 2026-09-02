import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertContact } from "../../lib/business-store";
import { assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "Create or update the contact for this conversation. Use whenever you " +
    "learn a name, phone, email, budget, city, need, or CRM id.",
  inputSchema: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    crmId: z.string().optional(),
    notes: z.string().optional(),
    attributes: z
      .record(z.string(), z.string())
      .optional()
      .describe("Lead fields such as budget, city, need, timeline."),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "upsert_contact");
    const contact = await upsertContact({
      name: input.name,
      phone: input.phone,
      email: input.email,
      crmId: input.crmId,
      notes: input.notes,
      attributes: input.attributes,
      sessionId: ctx.session.id,
      source: "agent",
    });
    return { id: contact.id, name: contact.name, status: contact.status };
  },
});
