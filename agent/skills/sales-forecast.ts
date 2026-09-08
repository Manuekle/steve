import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks what they will close, wants a forecast, asks how " +
          "much is really in the pipeline, why deals are being lost, or which stage " +
          "leaks. Also for win/loss patterns across closed deals.",
        `# Forecast and win/loss

What is actually going to close, and what the losses have in common. Three
shapes:

- **forecast** — the default. Commit / likely / pipeline, per currency.
- **leaks** — where deals die: which stage, how long they sit, what changes.
- **win-loss** — patterns across everything already closed.

## When to use

- "cuánto voy a cerrar este mes", "what's my forecast".
- "por qué estoy perdiendo negocios", "which stage loses deals".
- "qué tienen en común los que gané".

## When NOT to use

- A single deal's odds — read that deal and say what it needs.
- Cleaning bad records — CRM cleanup.

${INTAKE}

${PIPELINE_NOTE}

## The three buckets

The stored stage is the honest signal; a per-deal confidence number is a
question nobody answers truthfully twice. Classify from the stage plus how the
deal has behaved:

- **Commit** — negotiation, touched in the last 14 days, and either an expected
  close date inside the period or a proposal already out.
- **Likely** — proposal or negotiation, but stale or with no close date.
- **Pipeline** — meeting and qualified.
- **Excluded** — lead stage, and anything untouched for more than 60 days.
  Name the excluded total separately; hiding it is how a forecast becomes a
  wish.

## Steps

### forecast

1. pipeline action=summary — totals, weighted forecast, win rate, average days
   to close.
2. pipeline action=deals stage=[qualified, meeting, proposal, negotiation] —
   every open row, with days since update and expected close.
3. Sort each deal into a bucket by the rules above. Do the arithmetic per
   currency and never add two currencies together.
4. Report: a bucket table (count and value), then the three deals whose
   movement would change the number most, each with what it is waiting on.
5. Flag every deal that is more than twice the average days-to-close old, or
   overdue against its own expected close date.

### leaks

1. pipeline action=summary for the stage counts, then action=deals for every
   stage including won and lost.
2. For each stage: how many are sitting there, and the median days since last
   update. The stage with the most open deals and the oldest median is the
   leak.
3. Read the lost deals' reasons. Group them into at most four causes and give
   each a count. Never invent a cause for a loss recorded without one — count
   those as "sin motivo registrado" and say what percentage that is, because
   that number is itself the finding.
4. One recommendation per leak, tied to something the owner can do this week.

### win-loss

1. pipeline action=deals stage=[won, lost].
2. Compare the two groups on: source, value, days to close, and whatever
   contact attributes recur (city, budget, need).
3. Report what is true of wins and not of losses. Say how many deals each
   pattern rests on — a pattern from three deals is a hunch, and it must be
   labelled as one.
4. End with the disqualifier the evidence supports: the kind of lead worth
   saying no to faster.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
