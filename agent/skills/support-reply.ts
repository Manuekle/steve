import { defineDynamic } from "eve/skills";
import { INBOX_NOTE, INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner needs a support answer written: a reply to a customer with " +
          "a problem or a question, an apology for something that went wrong, or a no " +
          "to something the business cannot do.",
        `# Draft a support reply

I write it, the owner sends it. Support answers are facts plus tone, and the
facts are not mine to invent.

## When to use

- "contestale a [persona]", "qué le digo".
- "escribí la disculpa por el pedido que no llegó".
- "cómo le digo que no".

## When NOT to use

- Sending. I never send a support reply. The owner sends, or an automation
  they approved does.
- A sales message — that is the outreach skill.

${INTAKE}

${INBOX_NOTE}

## The facts come from documents, never from memory

This is the rule the whole skill rests on. Every price, policy, delivery time,
warranty term and hours claim comes back from search_knowledge or it does not
go in the reply. If it is not there, I say which fact I could not find and ask
for that one thing. A support answer with a made-up refund window is worse than
no answer — the customer acts on it.

For orders, shopify_orders is the fact. "Debería estar llegando" is not a
status; the tracking link is.

## The voice comes from what was already sent

Before writing, read how this business already talks:

1. inbox action=thread on the conversation being answered — the customer's own
   register, formal or not, tuteo or usted.
2. inbox action=search on a word this business uses often, and read the
   assistant lines that come back. That is the house voice, in its own past
   replies. Match it rather than inventing a support persona.
3. If the two disagree, follow the customer's register, not the archive's.

## Steps

1. **Read the thread.** What they asked, what was already said, what was
   promised. Never answer from the last message alone — the reply that repeats
   a question already answered is the one that loses the customer.
2. **Find the fact.** search_knowledge for the specific policy or price.
   shopify_orders for anything about an order.
3. **Write it**, in this order:
   - What went wrong or what they asked, named plainly. No throat-clearing.
   - The answer, with the number or the date in it.
   - What happens next, with who does it and by when.
4. **Length.** Most of these go to WhatsApp. Three to five lines. One ask at
   the end if anything is needed from them.
5. **Offer the follow-through.** If the reply promises something for a date,
   offer to set a reminder. If the customer should be handed to a person,
   say so rather than writing around it.

## When the answer is no

Say no in the first two lines, then why, then what can be done instead. A no
buried under three paragraphs of sympathy reads as a maybe, and the customer
comes back angrier.

## Never

- Apologise for something without saying what is being done about it.
- Promise a date the owner has not agreed to.
- Blame the customer, the courier, or "the system".
- Offer a refund, a discount, or an exception the knowledge base does not
  already grant. Propose it to the owner instead and let them decide.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
