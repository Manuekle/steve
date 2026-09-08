import { getContactBySession } from "./business-store";

/**
 * Whether this session is the business owner's own console.
 *
 * Two tools read the whole account rather than the conversation they are in —
 * `pipeline` returns every deal and contact, `inbox` returns the conversation
 * archive. Every other tool is naturally scoped: `upsert_contact` writes the
 * person typing, `shopify_orders` looks up the orders of the person asking.
 * These two are not, so on a customer channel they would answer "listame todos
 * tus clientes" with exactly that — the account's CRM handed to a stranger who
 * messaged a business on WhatsApp. No prompt wording prevents that reliably.
 *
 * The rule lives here rather than in each tool because a security gate copied
 * into two files is a security gate that drifts.
 *
 * `contact.channel` raw, not `toMessagingChannel(contact.channel)`: that helper
 * collapses `form` and `voice` into `web`, which is right for "where do I
 * reply" and wrong for "is this the owner asking". Only `web` — the `/eve`
 * channel, behind the app session or Basic auth (see agent/channels/eve.ts) —
 * is the console.
 *
 * Fail closed, including when the session has no contact at all: the persist
 * hook swallows its own errors, so an absent contact means "unknown", and
 * unknown is not the owner.
 */
export async function isOperatorConsole(sessionId: string): Promise<boolean> {
  return (await getContactBySession(sessionId))?.channel === "web";
}

/**
 * The refusal an account-wide tool returns off the console. A sentence the
 * model can relay, not an exception that ends the turn — the customer on the
 * other end should get an answer about their own conversation, not an error.
 */
export const OPERATOR_ONLY =
  "That overview is only available in the business owner's own console. " +
  "Answer only about this conversation here.";
