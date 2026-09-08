import { defineDynamic } from "eve/skills";
import {
  INTAKE,
  MARKETING_NOTE,
  NO_INVENTION,
  PLAIN_LANGUAGE,
  operatorSkill,
} from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks why people abandon their form, how to get more leads " +
          "out of it, whether the questions are right, or how well their lead-capture " +
          "forms are working.",
        `# Fix the form

The form is where paid traffic turns into a lead or leaves. It is also the
cheapest thing on this list to fix.

## When to use

- "por qué no completan el formulario".
- "qué preguntas pongo".
- "cómo vienen mis formularios".

## When NOT to use

- Building the form. The owner edits it on the Forms page; this agent has no
  tool that writes one. Everything here is a change list they apply.

${INTAKE}

${MARKETING_NOTE}

## Steps

1. **Read the numbers.** marketing action=forms. Per form you get: steps,
   fields, started, completed, completion rate, how many were identified as a
   contact, the hot/warm/cold split, average score and the maximum possible.
2. **See it as a visitor.** web_fetch the public form at its own URL. The
   numbers say people leave; the page says why.
3. **Diagnose in this order**, because the causes are ranked by how often they
   are the real one:
   - **Too many fields.** Count them. Every field costs completions, and a
     field nobody uses in the follow-up costs them for nothing. Name each
     field and what it is for; anything with no answer to that gets cut.
   - **Asking too early.** A phone number in step one, before the visitor
     knows what they get, is the most common single cause of abandonment.
   - **Required that should not be.** Every required field is a wall.
   - **Wrong promise.** The ad said one thing and the form asks about another.
     Compare against what the ads are actually promising.
   - **No reason to finish.** Nothing says what happens after they submit, or
     when.
4. **Read the scoring honestly.** Compare the average score against the
   maximum, and the hot/warm/cold split:
   - Almost everyone cold — the scoring is too strict, or the traffic is
     wrong. Look at the source before touching the form.
   - Almost everyone hot — the scoring means nothing and the sales side is
     wasting its time on every lead equally.
   - A healthy split has a minority hot. Say the numbers, not the verdict
     alone.
5. **Check the drop-off between started and identified.** A response with no
   contact attached is a person who typed something and left before saying who
   they are. If that gap is large, the identifying question is in the wrong
   step.

## The report

An ordered change list, most completions first, each one:

- The change, concretely — "sacá el campo Empresa", "moví el teléfono al
  último paso".
- Why, with the number behind it.
- What it costs — a field removed is information lost, and the trade should be
  stated rather than hidden.

Cap at five changes. A form with fifteen suggested fixes gets none of them.

## When there is no data

A form with no responses cannot be diagnosed from its numbers. Say that, then
review it as a page — field count, order, what is required, and whether the
first question is answerable without thinking. And say the more useful thing:
zero responses on a published form usually means nobody is sending traffic to
it, which is not a form problem at all.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
