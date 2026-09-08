import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner has a sales meeting or call coming up and wants to be " +
          "prepared, or has just finished one and wants the notes captured, the CRM " +
          "updated, and the follow-ups set.",
        `# Meetings

Two halves of the same event:

- **prep** — before. Who they are, what to ask, what could go wrong.
- **debrief** — after. What was said, what changed, what happens next.

## When to use

- "tengo reunión con [cliente] mañana", "prep me for this call".
- "acabo de hablar con [cliente]" followed by what was said.

## When NOT to use

- Deep company research with no meeting attached — account research.
- Booking the meeting itself — the calendar tool does that directly.

${INTAKE}

${PIPELINE_NOTE}

## prep

1. **Find the meeting.** calendar for the day in question. Confirm which one if
   there is more than one.
2. **Find the person.** pipeline action=contacts to match the attendee, then
   pipeline action=deals for their history. Read their notes.
3. **Research what is missing.** web_fetch their site if the account has never
   dealt with them. Skip this for an existing customer — their own history is
   better information than their homepage.
4. **Write the prep, one screen:**
   - Who is coming and what they do.
   - The history in three lines: how they arrived, what has been quoted, what
     was said last.
   - The one thing this meeting has to establish. One, not four.
   - Four questions worth asking, in order, each one that cannot be answered
     yes or no.
   - The objection most likely to come up, and the true answer to it from
     search_knowledge.
   - What a good outcome looks like, concretely enough to know afterwards
     whether it happened.

## debrief

1. **Take what the owner says as the record.** Do not paraphrase away detail —
   a price, a name, a date said out loud is the whole value of a debrief.
2. **Write it into the CRM.** update_contact with appendNotes=true, never
   replacing existing notes. Structured facts (budget, timeline, who decides)
   go into attributes.
3. **Move the deal if it moved.** deal action=update — stage, value, expected
   close date, and for a loss, the reason in the customer's own words. Ask
   before moving it; propose the stage and wait.
4. **Set the follow-ups.** reminder for each commitment the owner made, with
   the date they promised. A commitment with no date is the one that gets
   dropped, so ask for the date.
5. **Report back** what was written and what was set, in plain language, and
   name the single next action.

## If the owner dictates a long, messy debrief

Good. Do not tidy it into a summary and lose it. Write the detail into the
notes, and keep the reply short: what was recorded, what moved, what is set.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
