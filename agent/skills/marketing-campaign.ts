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
        "Use when the owner wants to plan something with a start and an end: a paid " +
          "push, a launch, a promotion, a seasonal campaign, or an automated sequence " +
          "for new leads.",
        `# Plan a campaign

A plan, not a launch. This agent cannot create a campaign, set a budget, send
an email, or publish a post. What it produces is a spec the owner executes, and
where a step can be automated inside Senka, a draft automation.

Shapes:

- **paid** — a Meta push behind one offer.
- **launch** — something new, announced across the channels this account has.
- **promo** — a dated offer.
- **sequence** — the automated follow-up for people who arrive.

## When to use

- "quiero hacer una campaña para X".
- "voy a lanzar Y, armá el plan".
- "qué hago con los que dejan el formulario a medias".

## When NOT to use

- Writing the individual pieces — the ad copy and post skills do that once the
  plan names them.

${INTAKE}

${MARKETING_NOTE}

${PIPELINE_NOTE}

## Before planning

1. **What happened last time.** marketing action=ads over last_30d and
   last_month. A campaign planned without reading the previous one repeats it.
2. **What converts.** marketing action=funnel — which source actually produces
   deals. Spend goes where it already works unless there is a reason it should
   not.
3. **What the offer is.** search_knowledge for the price and the terms. A
   campaign with an unsettled offer is a plan to improvise in public.

## The plan

Always these parts, and nothing else:

- **The offer**, in one sentence, with its price and its dates.
- **Who it is for** — from the persona work, not from a guess. If the account
  has no persona yet, say the campaign is being aimed by instinct.
- **The pieces**, listed: which ads, which posts, which forms, which automated
  messages. Name each and say who writes it.
- **The route** — exactly where a person goes from seeing it to buying. Every
  step named: ad, page or form, conversation, close. If any step does not
  exist yet, that step is the first task.
- **The money** — what the owner is willing to spend, and what a lead may cost
  before it stops being worth it. Compute that ceiling from the average won
  deal value, do not ask for a number nobody has thought about.
- **The dates** — start, end, and when to look at it. A campaign with no end
  date never gets evaluated.
- **The one number** that says whether it worked, and where to read it.

## sequence

For the automated half, be exact about what Senka can do:

1. list_automations first — including drafts. Half of these already exist,
   paused or never activated.
2. Pick a trigger from the five that exist: keyword, new_chat, no_reply,
   schedule, webhook. If the moment cannot be recognised by one of them, say so
   rather than designing around a trigger that does not exist.
3. Keep it to three or four steps and always end in either a real answer or
   transfer_human.
4. propose_automation creates a **draft**. It never runs and never messages
   anybody until the owner activates it from the Automations page. Say "te dejé
   el borrador", never "lo automaticé".

## Say what will not happen

Close every plan with the honest list: what this agent cannot do for it. It
cannot launch the ads, send the emails, publish the posts, or spend the money.
A plan that reads as though it will execute itself is the most expensive kind
of mistake here.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
