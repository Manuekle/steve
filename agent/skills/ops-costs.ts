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
        "Use when the owner asks what the AI is costing them, why the bill went up, " +
          "which channel or agent burns the most, or whether it is paying for itself.",
        `# What the AI costs

Every model call this app makes is recorded with its provider cost, the credits
it consumed, and which agent and channel it belonged to. This reads that back.

## When to use

- "cuánto me está costando", "por qué subió".
- "qué canal consume más".
- "vale la pena".

## When NOT to use

- Ad spend — that is the marketing performance skill. They are different
  budgets and must never be added together.

${INTAKE}

${OPERATIONS_NOTE}

${PIPELINE_NOTE}

## Reading the numbers honestly

- **Credits** are this app's own unit. **Provider cost** is dollars actually
  charged upstream. Report both and never present credits as money.
- **includedCost** is what the plan covered; **byokEstimatedCost** is what ran
  on the owner's own API keys, which the plan does not bill. An installation
  using its own keys pays the provider directly, so a low credit number there
  is not a low bill — say which regime this account is in before drawing any
  conclusion about spend.
- A **null agent or channel** is a call this app could not attribute, not an
  agent named null. Report it as unattributed and say what fraction it is. If
  most of the spend is unattributed, that is the finding, and every per-agent
  conclusion below it is unreliable.

## Steps

1. operations action=usage for the current period, then again with days=7 for
   the recent trend.
2. Report:
   - **Total** — credits and provider cost, and which regime (included, or own
     keys).
   - **Where it goes** — by channel first, since that is the one an owner can
     act on, then by agent, then by provider.
   - **The trend** — the daily series. Name any day that is more than double
     the median and say what was happening.
3. **Put it against what it produced.** pipeline action=summary for won deal
   value in the same window. State the two numbers side by side without
   pretending it is attribution: the AI touched some of those deals and not
   others, and this app cannot say which. A ratio is worth stating; a claim
   that the AI earned the money is not.
4. **If cost jumped**, the usual causes in order: a channel that got busier, a
   more expensive model selected, a playbook firing far more than expected
   (cross-check operations action=automations), or long conversations that
   never end. Name which one the data supports; say so if none does.

## What to change

Only suggest what this account can act on:

- A cheaper model for the busy channel, if quality allows.
- A playbook that resolves questions the bot currently answers from scratch
  every time — a knowledge document is cheaper than a conversation.
- Shortening conversations that end in a handover anyway: those pay twice.

Never recommend switching off the thing that is producing the revenue. If
spend is up because volume is up, that is the answer, and it is a good one.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
