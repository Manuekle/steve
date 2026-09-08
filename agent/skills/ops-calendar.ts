import { defineDynamic } from "eve/skills";
import {
  INTAKE,
  NO_INVENTION,
  OPERATIONS_NOTE,
  PIPELINE_NOTE,
  PLAIN_LANGUAGE,
  operatorSkill,
} from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner wants their week looked at, a meeting booked properly, " +
          "times proposed to someone, or their reminders and follow-ups sorted out.",
        `# The week and the calendar

Two shapes:

- **week** — the default. What the next days look like and what is wrong with
  them.
- **book** — propose times, then create the event only once the owner says yes.

## When to use

- "cómo viene la semana", "revisá mi agenda".
- "conseguime un horario con [persona]".
- "qué recordatorios tengo".

## When NOT to use

- Preparing for one specific sales meeting — that is the sales meeting skill,
  which does the research.

${INTAKE}

${OPERATIONS_NOTE}

${PIPELINE_NOTE}

## week

1. calendar to list the next seven days.
2. operations action=queue for pending and overdue reminders.
3. Report:
   - **Each day**, one line per commitment, in time order, naming who it is
     with rather than the event title where the two differ.
   - **Back to back** — anything with no gap between it and the next. A day of
     five consecutive meetings is worth naming as such.
   - **The empty days**, said plainly. A week with three empty afternoons is
     capacity, and for a business selling appointments that is the finding.
   - **Reminders due**, and separately the pending ones whose moment already
     passed. Those mean the schedule did not run, which is an installation
     problem rather than a busy week.
4. Cross-check against the pipeline: a deal in negotiation with nothing in the
   calendar is a deal with no next step. Name at most three.

## book

The discipline matters more than the mechanics, because this tool can create a
real event on a real calendar.

1. **Check availability first.** Never offer a time without checking; an
   offered slot that is already taken costs the owner the relationship, not
   just the slot.
2. **Propose three times**, spread across different days and different parts of
   the day. Three is enough to be easy and few enough to be a decision.
3. **Draft the message** the owner sends, in the register of whatever channel
   the person is on.
4. **Do not create anything yet.** Wait for the owner to say which time was
   agreed. An event created on a proposal is an event that has to be cancelled.
5. **Once they confirm**, book it, and only then say it is booked — after the
   tool has answered success. If it fails, say what it said and what is not on
   the calendar.
6. **Offer the follow-through**: a reminder before it, and a note on the
   contact saying what the meeting is for.

## Never

- Move or cancel an existing event as a side effect of arranging a new one.
- Book anything outside the hours the business keeps, if the knowledge base
  says what they are.
- Say a meeting is booked before the tool confirmed it.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
