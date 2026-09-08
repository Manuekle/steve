import { defineDynamic } from "eve/skills";
import { INBOX_NOTE, INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks what the agent does not know, why it keeps handing " +
          "conversations to a person, what to write documentation about, or wants an " +
          "answer turned into a reusable document.",
        `# Knowledge gaps

Every question the agent cannot answer becomes a person's problem. This finds
those and writes the fix. Two shapes:

- **gaps** — the default. What is missing, ranked by what it costs.
- **article** — turn one recurring question into a document to upload.

## When to see it this way

The agent answers from documents the owner uploaded on the Conocimiento page.
It cannot write to them. So the output of this skill is text the owner saves —
never a claim that something was added.

## When to use

- "por qué no sabe contestar esto", "qué le falta saber".
- "sobre qué escribo".
- "convertí esta respuesta en documento".

## When NOT to use

- A single reply to one customer — that is the reply skill.

${INTAKE}

${INBOX_NOTE}

## gaps

1. **Find the failures.** inbox action=list with outcome support, and the rows
   flagged waitingForHuman. A handover is the loudest possible signal that the
   knowledge base did not have the answer.
2. **Find the questions.** For each, open the thread and take the question the
   customer actually asked, in their words.
3. **Test the gap, do not assume it.** For each question, run
   search_knowledge with the customer's own phrasing. Three outcomes, and they
   need different fixes:
   - **Nothing comes back** — the answer is genuinely missing. Write it.
   - **Something comes back but not the answer** — the document exists and is
     wrong or out of date. Say which document.
   - **The right answer comes back** — the knowledge was there and the agent
     still handed over. That is a wording problem or a scope problem, and it is
     worth more than the other two because it is free to fix.
4. **Rank by distinct people affected**, and report: the question in customers'
   words, how many asked it, which of the three cases it is, and the specific
   document to write or fix.

Cap at five. A list of twenty gaps gets nothing written.

## article

For one question, write what the owner should upload:

1. Read every conversation where it came up (inbox action=search) so the
   article answers what people actually ask, not the tidy version.
2. search_knowledge for anything already written, so this does not contradict
   an existing document. If it does contradict one, stop and say which — two
   documents disagreeing is worse than one missing.
3. Write it:
   - The question as a customer would type it, as the title. That is what
     retrieval matches against.
   - The answer in the first two lines, with the number, date, or term in it.
   - The edge cases that came up in the conversations, each in one line.
   - What to do when it does not apply.
4. Keep it short and specific. A document that hedges retrieves badly and
   answers nothing.
5. End with where it goes: the Conocimiento page, uploaded by the owner. Never
   report it as added.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
