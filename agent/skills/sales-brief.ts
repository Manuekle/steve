import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks what to do today, wants a morning brief, a Monday " +
          "review, a weekly roll-up, or a one-screen answer to 'how are sales going'.",
        `# Sales brief

One screen. What is happening today, what is stuck, and the three moves worth
making. Two shapes, picked from what was asked:

- **today** — the default. This morning's meetings, what is waiting on the
  owner, what went quiet.
- **week** — the Monday roll-up. What closed, what slipped, what is stale, the
  leakiest stage, top three moves.

## When to use

- "what do I have today", "resumen del día", "brief me".
- "how are sales going", "revisión semanal", "Monday review".
- Any open-ended "where do things stand" about the business as a whole.

## When NOT to use

- A question about one customer or one deal — read that deal instead.
- A forecast with committed numbers — that is the sales forecast skill.
- A data-hygiene sweep — that is the CRM cleanup skill.

${INTAKE}

${PIPELINE_NOTE}

## Steps

1. **Read the board.** pipeline action=summary. That gives totals per
   currency, the stage counts, win rate, average days to close, and how many
   deals are stale or overdue.

2. **Pull what needs a person.** In parallel:
   - pipeline action=deals with onlyStale=true — open deals untouched 14+ days.
   - pipeline action=deals with onlyOverdue=true — past their expected close.
   - pipeline action=deals stage=[proposal, negotiation] — the ones closest to
     money.
   - pipeline action=contacts status=waiting_human — people the bot handed over
     and nobody answered.

3. **Today's calendar.** calendar to list today's events (week shape: the next
   seven days). Name who each meeting is with, not the event id.

4. **Reminders.** reminder action=list for anything due.

5. **Write the brief.** Same order every time, so it is scannable:
   - **Today** — meetings, in time order, one line each.
   - **Waiting on you** — handovers, overdue deals, due reminders.
   - **Going cold** — stale deals, oldest first, with how long they have sat.
   - **The money** — open pipeline and weighted forecast per currency, and what
     changed since the last brief if the conversation has one.
   - **Top 3 moves** — specific, each naming a person and an action. "Call
     Marta about the 450.000 quote, it has sat 19 days" beats "follow up on
     stale deals".

6. **Stop there.** A brief that ends in a question the owner has to answer is
   not a brief. If something is genuinely ambiguous, add it as a fourth line
   under the moves, not as a blocking question.

## When the week was quiet

Say so in one line and stop. A brief padded out to look busy trains the owner
to skip it. "Nada se movió esta semana: 4 negocios abiertos, ninguno tocado.
El más viejo es el de Marta, 23 días." is a complete answer.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
