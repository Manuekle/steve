import { defineDynamic } from "eve/skills";
import {
  INTAKE,
  MARKETING_NOTE,
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
        "Use when the owner asks whether marketing is working: what the ads are " +
          "costing, where leads come from, what is actually bringing in money, where " +
          "the funnel leaks, or whether an ad spend is worth it.",
        `# Is marketing working

The three numbers that answer it live in three places, and only the join is
useful: what the ads cost, what the forms convert, and which source ends up
paying. Shapes:

- **overview** — the default. Money in, leads out, what changed.
- **funnel** — where people fall out, and the biggest leak.
- **attribution** — which source pays for itself.

## When to use

- "está funcionando la publicidad", "cuánto me sale un lead".
- "de dónde vienen mis clientes".
- "por qué entran consultas y no vendo".

## When NOT to use

- Writing the ad — that is the ad copy skill.
- The sales pipeline on its own — that is the sales brief.

${INTAKE}

${MARKETING_NOTE}

${PIPELINE_NOTE}

## overview

1. marketing action=ads for the period asked for, or last 30 days.
2. marketing action=forms.
3. marketing action=funnel.
4. Report, in this order:
   - **Spend and what it bought** — total spend, leads, cost per lead, and the
     two campaigns that account for most of the money.
   - **What arrived** — contacts by source, and how many completed a form.
   - **What it became** — deals opened and won by source, with the money.
   - **The one number to watch** — usually cost per lead against average won
     deal value. Say both and the ratio; a lead costing more than a tenth of a
     typical sale is a business problem, not a marketing tweak.
5. If a campaign spent money and produced no leads, name it and its spend on
   its own line. That is the finding.

## funnel

Five stages, and the leak is wherever the drop is worst:

1. **Impressions to clicks** — the ad's click-through rate. A low one is the
   creative or the audience.
2. **Clicks to form starts** — clicks against form responses started. A big
   drop is the landing page or a mismatch between the ad's promise and it.
3. **Starts to completions** — the form's completion rate. A drop here is the
   form, and the forms skill fixes it.
4. **Completions to conversations** — how many responses were identified as a
   contact.
5. **Contacts to won deals** — by source.

Name one leak, not five. Say what the drop is in numbers, what usually causes
it, and the single change worth trying. Then say what you could not measure:
Senka sees Meta's own click count and its own form data, and nothing in
between, so the click-to-start step is an estimate. Label it one.

## attribution

1. marketing action=funnel and pipeline action=summary.
2. Per source: contacts, deals, won, money won, and where ad spend exists, the
   cost against it.
3. Rank by money won, then by conversion rate. Volume is the misleading one —
   a source that brings forty cold leads and one sale loses to one that brings
   four and closes two.
4. Be explicit about what this attribution is: it is the source recorded on
   the contact when they arrived, last touch, nothing more. It does not know
   what someone saw before they wrote. Say that once.

## What is missing to measure

Whenever a number cannot be computed, say which and why, rather than omitting
it. The usual ones: Meta not connected, forms with no responses, deals without
a source, or a source string typed inconsistently so the same channel appears
twice. That last one is worth flagging by name — it silently halves a source.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
