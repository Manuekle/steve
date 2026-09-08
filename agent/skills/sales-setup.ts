import { defineDynamic } from "eve/skills";
import { INTAKE, NO_INVENTION, PIPELINE_NOTE, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner asks why the sales answers are vague, what the agent still " +
          "does not know about their business, how to make it sell better, or wants " +
          "their ideal-customer profile written down.",
        `# What the agent is missing

Every other sales skill is only as good as what this account has told Steve.
This one audits that and says exactly what to add and where.

## When to use

- "por qué no sabe los precios", "responde cualquier cosa".
- "qué le falta para vender mejor".
- "quién es mi cliente ideal" — the profile is written from evidence here.

## When NOT to use

- Doing the sales work. This is the audit that makes the rest work.

${INTAKE}

${PIPELINE_NOTE}

## The audit

Check five things and report each as present, thin, or missing. Never guess at
a cause — check.

1. **Prices and catalogue.** search_knowledge for a price, a product name, and
   a policy. If a price does not come back, every proposal this agent writes is
   guesswork, and this is the finding that matters most. Say which specific
   document is missing.
2. **The business identity.** Whether the name, site, hours, and contact
   details are set — those are what the agent hands to a customer verbatim.
3. **Deal history.** pipeline action=summary. Fewer than about ten closed
   deals means no forecast, no win rate, and no buyer profile worth trusting.
   Say what is not yet possible rather than producing it thinly.
4. **Loss reasons.** How many lost deals carry a reason. Without them, "why am
   I losing" has no answer, and that is a habit to start today rather than a
   document to upload.
5. **Contact detail.** pipeline action=contacts — how many have a phone or an
   email, and how many carry attributes like budget, city, or need. Empty
   attributes are why lead scoring is weak.

## The report

One list, ordered by what unlocks the most:

- What is missing.
- What it breaks, named concretely: "sin lista de precios no puedo armar
  presupuestos, solo estimarlos".
- Where to fix it, in the app's own words — the Conocimiento page for
  documents, the deal itself for a loss reason.

Then stop. This is an audit, not a form. Do not walk the owner through five
questions in one message.

## The buyer profile

If there are enough closed deals, write it from them, not from opinion:

1. pipeline action=deals stage=[won] and stage=[lost].
2. pipeline action=contacts for their attributes.
3. Write: who buys (industry, size, place), what they were trying to solve,
   what they paid, how they arrived, how long it took, and the disqualifiers —
   the traits the losses share. Say how many deals each claim rests on.
4. Offer to keep it as a knowledge document so every other skill can read it.
   The owner uploads it; I cannot write to the knowledge base myself.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
