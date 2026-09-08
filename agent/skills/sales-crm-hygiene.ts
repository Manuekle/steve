import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner wants the CRM cleaned up: duplicates, missing phones or " +
          "emails, deals stuck in the wrong stage, contacts nobody followed up, or " +
          "an answer to 'is my pipeline data any good'.",
        `# CRM cleanup

Find what is wrong with the records and propose the fix. I surface a list; the
owner approves it. I never bulk-edit.

## When to use

- "limpiá el CRM", "hay duplicados", "clean up my contacts".
- "estos números no cierran" about the dashboard.
- Before a forecast the owner intends to trust.

## When NOT to use

- Reading the pipeline's shape — that is the brief or the forecast.
- Deleting anything. There is no delete tool and there should not be.

${INTAKE}

${PIPELINE_NOTE}

## What counts as a problem

Six checks, in this order. Each one produces rows, never edits.

1. **Duplicate people.** Two contacts with the same phone (compare digits
   only — +54 9 11 and 011 are the same number), the same email, or the same
   name on the same channel within a few days of each other.
2. **Unreachable contacts.** No phone and no email, on a contact with an open
   deal. Everything else can wait; a deal you cannot follow up on cannot.
3. **Stale open deals.** Open and untouched for 14+ days
   (pipeline onlyStale=true). Past 60 days it is not stale, it is lost with no
   one willing to say so.
4. **Overdue deals.** Past their own expected close date and still open
   (pipeline onlyOverdue=true). Either the date was wrong or the deal is.
5. **Stage against evidence.** A deal in proposal or negotiation whose contact
   has not sent a message in 30+ days. A deal in lead stage with a value
   already set. A won deal with a value of zero.
6. **Losses with no reason.** Lost deals with no recorded reason, which is what
   makes win/loss analysis impossible later.

## Steps

1. pipeline action=contacts with a limit of 100, and pipeline action=deals
   across every stage. Note the totalMatched each returns — if it exceeds the
   rows I got back, say I reviewed the most recent N of M and offer to
   continue, rather than reporting a slice as the whole board.
2. Run the six checks over what came back.
3. Report grouped by check, worst first, each row naming the person and the
   single concrete fix. Cap at ten rows per check and give the remaining count.
4. Ask which group to fix. Then, for the approved group only, apply changes one
   at a time — deal action=update for stages and reasons, update_contact for
   notes and attributes — and report what each call answered.
5. If nothing is wrong, say exactly that with the counts that prove it.

## On duplicates specifically

I do not merge. There is no merge tool, and inventing one out of an update plus
a note loses data silently. I report the pair, say which one looks like the
record to keep and why (more recent activity, more fields filled, has the open
deal), and let the owner merge them in the app.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
