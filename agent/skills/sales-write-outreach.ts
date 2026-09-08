import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner needs a message written to a customer or prospect: a cold " +
          "approach, a follow-up on a quote, a reply to someone who went quiet, a " +
          "renewal or win-back, or an answer to a specific objection.",
        `# Write outreach

Draft the message. I write, the owner sends. Shapes:

- **cold** — first contact, no prior relationship.
- **followup** — a quote or proposal is out and nothing came back.
- **revive** — they went quiet mid-conversation.
- **winback** — a lost deal worth reopening.
- **objection** — they said no, or said the specific thing that stops the sale.

## When to use

- "escribile a [persona]", "draft a follow-up".
- "qué le contesto a esto".
- "me dijeron que es caro" and every other objection.

## When NOT to use

- Sending it. I never send outreach. The owner sends, or an automation they
  approved does.
- A proposal with prices and terms — that is the proposal skill.

${INTAKE}

${PIPELINE_NOTE}

## Voice comes from the account, not from me

Before writing a word:

1. search_knowledge for how this business already describes what it sells. Use
   its words for its own products — never a synonym I preferred.
2. Read the contact's own messages if there are any (their notes, the deal
   notes). Match their level of formality and their language. In Spanish,
   match tuteo or usted to whatever they used.
3. If the account has a business profile, its tone is the default.

## Length and shape

Short. Four to six lines for a cold message, two to four for a follow-up. One
ask, at the end, and it is a question they can answer in one word.

Never: "espero que estés bien", "quería hacer seguimiento", "solo para
recordarte", "no quiero molestar", an opening paragraph about this business
before the reader's own situation, or three questions in a row.

## Steps

1. **Get the context.** pipeline action=deals for this contact's history, and
   the contact's notes. For **cold**, the account research if it exists — a
   cold message with no specific reason for writing is spam and I say so
   rather than writing it.
2. **Find the reason to write now.** A trigger from research, a date on the
   quote, something they said. If there genuinely is not one, say that and
   propose waiting instead of manufacturing urgency.
3. **Draft two versions**, clearly different — not the same message with
   different adjectives. One direct and short, one that leads with the reason
   for writing. Label what each is betting on.
4. **Name the channel.** WhatsApp, email and Instagram are different lengths
   and different registers; ask which if it is not obvious from the contact's
   channel.
5. **Offer the follow-up.** If the owner sends it, offer to set a reminder for
   when to chase it (reminder), and to move the deal (deal action=update) —
   ask, do not do it.

## Objections

For the **objection** shape, do not write the rebuttal first. In order:

1. Name what they actually said, in their words.
2. Say what is true in it. An objection with nothing true in it is usually a
   different objection wearing a mask.
3. search_knowledge for the real answer — the price, the term, the guarantee.
   An objection answered from memory instead of from the business's own
   documents is how a wrong number reaches a customer.
4. Then the reply: acknowledge, answer with the fact, ask one question that
   moves it forward.

"Es caro" is nearly always about the value being unclear or the timing being
wrong. Ask which, rather than discounting.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
