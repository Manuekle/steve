import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertChat, upsertContact } from "../../lib/business-store";
import { assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "Transfer this conversation to a human. Pauses automated replies and " +
    "flags the inbox. Use when the user asks for a person, a playbook step " +
    "says transfer_human, or you cannot complete the request.",
  inputSchema: z.object({
    reason: z.string().optional().describe("Why the handoff is happening."),
    message: z.string().optional().describe("Short message to show in the inbox."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    contactId: z.string(),
  }),
  async execute({ reason, message }, ctx) {
    await assertToolAllowed(ctx.session.id, "transfer_human");
    const lastMessage = message ?? reason ?? "Transferred to a human.";
    const contact = await upsertContact({
      sessionId: ctx.session.id,
      status: "waiting_human",
      notes: reason,
      lastMessage,
      source: "handoff",
    });
    const channel = contact.channel === "form" ? "web" : contact.channel;
    await upsertChat({
      title: contact.name,
      channel,
      lastMessage,
      lastMessageAt: new Date().toISOString(),
      messageCount: 1,
      sessionId: ctx.session.id,
      handoff: true,
    });
    return { ok: true, contactId: contact.id };
  },
});
