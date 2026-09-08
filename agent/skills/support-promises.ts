import { defineDynamic } from "eve/skills";
import { INBOX_NOTE, INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner wants to know what was promised to customers and never " +
          "delivered: callbacks, quotes, dates, replacements, anything the business " +
          "said it would do.",
        `# What we promised

The commitments made in conversations, and which ones are past due. This is the
cheapest trust the business has to lose.

## When to use

- "qué le prometí a la gente", "quedé en avisarle a alguien".
- "hay algo que quedó colgado".
- Weekly, as part of the support review.

## When NOT to use

- Automatic nudges to customers who went quiet. Those already exist: an
  automation with a no_reply trigger sends them on its own once the owner
  activates it. This skill is about what the *business* owes, not what the
  customer owes.

${INTAKE}

${INBOX_NOTE}

## Finding a promise

A promise is a sentence the business sent that commits it to a future action.
Search the archive for how this business phrases them, with several passes —
one word will not find them:

- inbox action=search for "te aviso", "te confirmo", "te paso", "mañana",
  "la semana que viene", "te mando", "te llamo", "en cuanto".
- Adjust for how this business actually writes: read a few assistant lines
  first and search the phrases it really uses.
- Search in the customer's language too when the archive is mixed.

Then keep only the assistant lines. A customer saying "te aviso" is not a
commitment by the business.

## What makes it overdue

1. The promise names a time ("mañana", "el jueves", "en 24hs") and that time
   has passed.
2. No message went out after it. If the archive shows a later reply that
   delivered the thing, it is closed, not overdue.
3. Where there is no time named, use seven days as the line and say that is
   what was assumed — an assumed deadline reported as a real one is a
   fabrication.

## Steps

1. Run the searches. Collect one row per conversation, not per phrase.
2. For each candidate, open the thread (inbox action=thread) before calling it
   overdue. A search hit without the surrounding conversation is how a
   delivered promise gets reported as broken.
3. Report, oldest first: who, what was promised, in the business's own words,
   when it was due, and whether anything happened after.
4. Offer to set a reminder per row (reminder), and to draft the catch-up
   message (the reply skill). Ask before doing either.
5. Say the count of promises found and how many are still standing. "Diez
   promesas, dos vencidas" is the headline.

## Being wrong carefully

This reads language, not a commitments field, so it will miss some and flag
some that were kept. Say that once, at the end, and make every row checkable by
quoting the sentence it came from.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
