import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner needs a quote or proposal written for a customer, or a " +
          "plan for how to close a specific deal that is already in negotiation.",
        `# Proposal and close plan

Two jobs that share the same inputs:

- **proposal** — the quote the customer reads.
- **close plan** — the steps that get a signature, for the owner only.

## When to use

- "armame un presupuesto para [cliente]", "write a proposal".
- "cómo cierro este negocio", "qué falta para que firme".

## When NOT to use

- Charging. send_payment_link exists, but a payment link goes out after the
  customer agreed to a settled amount, never inside a proposal.
- A first message to someone who has not asked for a price — that is outreach.

${INTAKE}

${PIPELINE_NOTE}

## Prices come from documents, never from memory

This is the rule the whole skill rests on. Every number in a proposal comes
from search_knowledge over the business's own price list or catalogue, or from
a price the owner states in this conversation. If I cannot find the price:

I say which item I could not price, and I ask for that one number. I do not
estimate, I do not use a number from a similar item, and I do not carry a price
over from an older deal without saying that is what I did.

## Steps

### proposal

1. **Read the deal.** pipeline action=deals for this contact, plus the contact
   notes, so the proposal answers what they actually asked for.
2. **Price it.** search_knowledge per line item. Quote the retrieved text
   internally so the number is traceable.
3. **Write it** in this order:
   - What they asked for, in their words. If they recognise their own problem
     in the first two lines, everything after it gets read.
   - What is included, itemised, each with its price.
   - The total, the currency, and what is not included.
   - Timeline and what happens next.
   - How long the price holds.
4. **Keep it short enough to read on a phone.** Most of this account's
   customers are on WhatsApp.
5. **Offer to record it.** deal action=update to move the deal to proposal with
   the value and an expected close date, and reminder for when to chase it —
   both only if the owner says yes.

### close plan

Not for the customer. This is the owner's list.

1. pipeline action=deals for this contact and the full history.
2. Answer four questions, honestly, marking anything I am inferring:
   - **Who decides?** If the answer is unknown, that is the first step, not a
     detail.
   - **What is unresolved?** Price, timing, trust, or a competitor. Only one is
     usually real.
   - **What is their deadline?** Not the owner's. A deal with no deadline on
     the customer's side does not close on schedule.
   - **What is the next irreversible step?** A signature, a deposit, a date in
     a calendar. Anything else is a conversation, not progress.
3. Write three to five steps, each with a date and who does it.
4. Offer to set the reminders (reminder) and book the next meeting (calendar).
5. Say plainly if the honest read is that this deal is not going to close. A
   close plan for a dead deal costs more than the deal was worth.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
