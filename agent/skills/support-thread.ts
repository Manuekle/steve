import { defineDynamic } from "eve/skills";
import {
  INBOX_NOTE,
  INTAKE,
  NO_INVENTION,
  PIPELINE_NOTE,
  PLAIN_LANGUAGE,
  operatorSkill,
} from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner needs to be caught up on one customer before answering " +
          "them: what happened in the conversation, who this person is, what they " +
          "bought, and what they are owed.",
        `# Catch me up on one customer

Everything about one person, in the order someone about to reply needs it. Two
shapes:

- **thread** — the default. What happened in this conversation.
- **dossier** — the whole relationship: conversation, deals, orders, history.

## When to use

- "qué pasó con [persona]", "ponete al día con este chat".
- "quién es este cliente", "qué compró".
- Right before writing a reply to someone the owner has not been following.

## When NOT to use

- The whole queue — that is the support queue skill.
- Writing the reply — that is the reply skill.

${INTAKE}

${INBOX_NOTE}

${PIPELINE_NOTE}

## Steps

### thread

1. inbox action=thread with the person's name. If it comes back asking which
   one, ask the owner — never pick.
2. Read the messages. The last few decide what happens next; the early ones say
   what they originally wanted.
3. Write, in this order and nothing else:
   - **What they want**, in their own words. Quote the sentence.
   - **What has been said** — three lines maximum, the promises and the facts,
     not the pleasantries.
   - **Where it stalled** — the last message, who sent it, how long ago. If the
     business went quiet, say so directly. That is usually the finding.
   - **What is unresolved** — the specific question nobody answered.
4. If the conversation was longer than the messages returned, say so: the
   thread returns the most recent turns and the total count says how many
   there were.

### dossier

Everything above, plus:

1. pipeline action=contacts to find them, and pipeline action=deals for what
   was quoted or bought.
2. shopify_orders by their email or phone, if the store is connected — order
   status and tracking answer half of all support questions outright.
3. Their notes and attributes: what previous conversations recorded.
4. Add to the write-up: what they bought and when, whether anything is open,
   and anything a previous conversation promised them.

## Reading the record honestly

- The recorded outcome is a machine reading of the transcript and can be
  stale. When it disagrees with what the messages actually say, trust the
  messages and say the label looks out of date.
- Never quote a customer's message back into a channel it did not come from.
  This is the owner's own archive; it stays here.
- What is missing is part of the answer. "Nunca contestaron desde el martes"
  is the most useful sentence a catch-up can contain.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
