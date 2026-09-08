import { defineDynamic } from "eve/skills";
import { INBOX_NOTE, INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks what is waiting in support: who needs an answer, who " +
          "has been waiting too long, what the bot could not handle, or how to sort a " +
          "pile of new messages.",
        `# The support queue

Who is waiting, how long, and what to do about it. Two shapes:

- **now** — the default. What needs a person today, worst wait first.
- **sort** — a pile of new messages classified into what they actually are.

## When to use

- "qué tengo pendiente", "quién está esperando".
- "hay algo urgente en soporte".
- "ordename esto" with a batch of new messages.

## When NOT to use

- Money and deals — that is the sales brief.
- One specific conversation — that is the thread skill.
- Writing the answer — that is the reply skill, which this one hands off to.

${INTAKE}

${INBOX_NOTE}

## What counts as waiting

Steve records where each conversation left the person. For support, the
signals that matter are, in order:

1. **Flagged for a person.** A row with waitingForHuman, or a contact with
   status waiting_human. Somebody asked for a human and the bot stopped
   replying. This is a person standing at a counter — it goes first, always,
   regardless of what the conversation was about.
2. **Outcome support, still moving.** A customer with a problem, touched
   recently.
3. **Gone quiet mid-problem.** Outcome no_response on a conversation that had
   reached support or interested. The bot stopped mattering and nobody noticed.
4. **Unassessed.** Steve has not classified it yet, usually because it is too
   short. Report these as "sin evaluar" — never as unqualified.

## Steps

### now

1. inbox action=list. Note totalMatched against the rows returned and say
   which portion you read.
2. Group by the four signals above. Within each group, longest wait first —
   daysSinceUpdate is the number that matters, not recency.
3. Report at most six rows in the first two groups: who, on which channel, how
   long they have waited, and the one line the classifier recorded. Then counts
   for the rest.
4. For anything older than two days with a person waiting, say so plainly.
   A queue report that buries a three-day wait in a tidy list is worse than no
   report.
5. Offer the next step per row: open the thread, or draft the reply. Do not do
   either unprompted.

### sort

For a batch the owner pastes or points at, classify each into one of:

- **question** — answerable from the knowledge base. Say which document.
- **problem** — something is broken or missing for them.
- **billing** — payment, invoice, refund.
- **request** — they want something the business does not do yet.
- **not support** — a sales enquiry (hand to the sales skills) or spam.

Give each a priority from what it costs the customer, not from tone. Somebody
polite whose order never arrived outranks somebody angry asking about hours.
Then report the counts per class and the three to handle first.

## The number worth saying out loud

If more than a third of the queue is flagged for a person, the bot is handing
over too often — usually a knowledge gap, not a bot problem. Say it once, with
the fraction, and point at the docs skill.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
