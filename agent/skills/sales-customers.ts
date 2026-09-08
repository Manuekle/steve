import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks about existing customers rather than new ones: who is " +
          "worth selling more to, who is at risk of leaving, who to win back, or how " +
          "to onboard someone who just bought.",
        `# Existing customers

The people who already bought. Three shapes:

- **expand** — who is worth selling more to, and what.
- **risk** — who has gone quiet and is probably leaving.
- **onboard** — the plan for someone who just said yes.

## When to use

- "a quién le puedo vender más".
- "quién se me está por ir", "hace mucho que no sé nada de X".
- "cerré con [cliente], qué sigue".

## When NOT to use

- Anything about people who have not bought — that is find-leads, research,
  or the forecast.

${INTAKE}

${PIPELINE_NOTE}

## expand

1. pipeline action=deals stage=[won] — everyone who bought, what for, how much.
2. pipeline action=contacts — their attributes and how long since they last
   said anything.
3. Cross the two: a customer who bought one thing this account sells three of
   is the whole opportunity. Rank by what they bought against the catalogue
   (search_knowledge), not by deal size.
4. Report the top five with: what they bought, what they have not, the reason
   to raise it now, and the opening line. Offer to draft the outreach.

## risk

Steve has no product-usage signal, so I use the two honest ones it does have —
silence and history — and I say that is what I am using. I do not invent a
health score out of nothing.

1. pipeline action=contacts — days since the last message, per customer.
2. pipeline action=deals — whether anything is open, and what closed when.
3. Rank the won customers by silence, longest first, and flag:
   - Silent longer than their own previous gap between contacts.
   - A lost deal after a won one — they tried again and did not buy.
   - Status waiting_human that nobody ever answered. This one is not risk, it
     is an open wound, and it goes first.
4. Report at most eight, each with how long they have been quiet and the last
   thing that happened. Offer a win-back message per row.

## onboard

1. Read the won deal and what was promised (deal notes, the proposal in the
   conversation).
2. Write the plan: what happens in the first week, who does what, and the
   date each step has to happen by.
3. Set it up, after asking: reminder for each step, calendar for anything that
   needs the customer present.
4. If the same onboarding repeats for every customer, say so and offer
   propose_automation to make it a playbook. It is created as a draft and never
   runs until the owner activates it — say that plainly, because "I automated
   it" and "I drafted an automation" are very different sentences.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
