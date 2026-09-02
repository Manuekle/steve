import { defineTool } from "eve/tools";
import { z } from "zod";
import { getContactBySession } from "../../lib/business-store";
import { createCheckoutLink } from "../../lib/payments";
import { assertToolAllowed } from "../../lib/agent-scope";

// Charging, from inside a conversation.
//
// The automation step of the same name has always existed, but it only fires
// on a rule someone wrote in advance — so an agent that had just agreed a
// price mid-chat had no way to collect it, and the closest thing it could do
// was promise a link a human would have to send by hand.
//
// This returns the URL rather than sending it: the agent is already talking on
// the channel, and its own reply is the message. What this does own is the
// part the agent cannot be trusted to remember — creating the link on the
// right processor, and writing it into the ledger so the merchant webhook can
// mark the contact paid (see lib/payment-store.ts).

export default defineTool({
  description:
    "Create a payment link for this contact and return its URL, so you can send it in your reply. " +
    "Use when the person has agreed to pay for something and the amount is settled. " +
    "Never invent a price: use one the person accepted, or one that comes from the knowledge base. " +
    "The link is one-time and for a single item.",
  inputSchema: z.object({
    amount: z
      .string()
      .describe('Decimal amount, as agreed. "49.99", not "4999" and not "$49.99".'),
    currency: z
      .string()
      .describe('ISO 4217 code, e.g. "usd", "ars", "mxn". Ask if you are not sure which applies.'),
    productName: z
      .string()
      .describe("What is being paid for, in the customer's words. Appears on the checkout page."),
    provider: z
      .enum(["stripe", "mercadopago"])
      .optional()
      .describe("Leave unset unless the person asked for a specific processor."),
  }),
  outputSchema: z.object({
    created: z.boolean(),
    url: z.string().optional(),
    provider: z.string().optional(),
    /** Why nothing was created, for the agent to relay honestly. */
    reason: z.string().optional(),
  }),
  async execute({ amount, currency, productName, provider }, ctx) {
    await assertToolAllowed(ctx.session.id, "send_payment_link");

    const contact = await getContactBySession(ctx.session.id);
    try {
      const created = await createCheckoutLink({
        amount,
        currency,
        productName,
        requested: provider,
        contactId: contact?.id,
      });
      if (!created) {
        return {
          created: false,
          reason:
            "No payment processor is configured for this business. Tell the person you cannot take " +
            "payment here, and do not send any link.",
        };
      }
      return { created: true, url: created.url, provider: created.provider };
    } catch (error) {
      // A rejected amount or an unsupported currency comes back as a sentence
      // the agent can act on, instead of ending the turn with an exception.
      return {
        created: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
