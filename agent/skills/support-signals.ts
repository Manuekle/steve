import { defineDynamic } from "eve/skills";
import { INBOX_NOTE, INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks what customers keep saying, what keeps breaking, what " +
          "people keep asking for, or wants the recurring complaints pulled out of the " +
          "conversations.",
        `# What customers keep saying

The archive read as evidence rather than as a queue. Three shapes:

- **themes** — the default. What comes up over and over.
- **broken** — what customers report as not working.
- **wants** — what they ask for that the business does not do.

## When to use

- "qué me están diciendo los clientes", "qué se repite".
- "qué se rompe seguido".
- "qué me piden que no tengo".

## When NOT to use

- Today's queue — that is the support queue skill.
- One customer — that is the thread skill.

${INTAKE}

${INBOX_NOTE}

## Method

There is no topic field on a conversation, so this is done by search and it has
to be done honestly.

1. **Start from the outcomes.** inbox action=list with outcome support, then
   with no_response. Those two are where friction lives. Read the recorded
   reason on each — the classifier already wrote one line per conversation and
   those lines cluster faster than raw text.
2. **Turn the recurring reasons into search terms.** If four reasons mention
   delivery, search the archive for the words customers actually use for it —
   "envío", "llegó", "demora", "correo", "seguimiento". Search their words,
   not the business's.
3. **Count conversations, never mentions.** One customer who complained six
   times is one. Report the number of distinct people behind each theme, and
   say it that way.
4. **Quote.** Every theme carries two verbatim customer lines. A theme with no
   quote behind it is a summary of my own guess, and it gets dropped.

## Reporting

Ordered by how many distinct people, not by how angry any one of them was:

- **The theme**, in the customers' own words rather than a category name.
  "No saben dónde está el pedido" beats "logística".
- **How many people**, out of how many conversations read.
- **Two quotes.**
- **What it costs** — handovers to a person, lost sales, repeated questions.
- **The one thing that would remove it.** For a repeated question, that is
  usually a document in the knowledge base, not a change to the business.

Then: the honest caveat. Say how many conversations were read out of the total,
and that this is a read of language, not a tally of tickets.

## Where each finding goes

- **A question asked repeatedly** — the docs skill. It is a knowledge gap, and
  every repeat is a handover that did not need to happen.
- **A step handled the same way every time** — the playbook skill. It is an
  automation.
- **Something genuinely broken** — a list for the owner, with the customers
  affected named so they can be told when it is fixed.
- **A request the business does not serve** — count it and leave it. Three
  people asking is noise; thirty is a product decision, and it is the owner's.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
