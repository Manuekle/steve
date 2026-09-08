import { defineDynamic } from "eve/skills";
import {
  INBOX_NOTE,
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
        "Use when the owner needs ad copy: headlines, ad text, calls to action, or " +
          "variants to test — for Meta, Instagram, or anywhere else they advertise.",
        `# Ad copy

Drafts only. This agent cannot create, edit, or fund a campaign; the owner
pastes the copy into the Ads screen or Meta itself.

Shapes:

- **ad** — the default. Full ad: headline, body, call to action.
- **variants** — several versions of one element to test.
- **rewrite** — tighten copy that already exists.

## When to use

- "escribime un anuncio", "necesito copy para Meta".
- "dame 10 títulos".
- "mejorá este texto".

## When NOT to use

- Deciding budget or audience — that is the owner's, and this agent has no
  tool for either.
- Organic posts — that is the post skill. An ad interrupts; a post is invited.

${INTAKE}

${MARKETING_NOTE}

${INBOX_NOTE}

## Before writing

Three reads, in this order. Skipping them is how generic copy happens.

1. **What already worked.** marketing action=ads. Look at which campaigns had
   the lowest cost per lead, and say what their names and objectives suggest
   about the offer. If a campaign spent well and converted nothing, say what
   not to repeat.
2. **The customer's words.** inbox action=search for how people describe the
   problem this ad is about. The headline should be a sentence a customer
   already typed.
3. **The facts.** search_knowledge for the price, the offer, the guarantee, the
   delivery time. Any number in an ad comes from a document. An invented price
   in an ad is a promise to strangers.

## Steps

1. **Name the one job.** An ad does one thing: get a click from the right
   person. If the owner has not said what the ad should make happen — a
   message, a form, a call — ask that one question first.
2. **Write three genuinely different angles**, not three rewordings:
   - **Problem** — open on what the customer said hurts, in their words.
   - **Proof** — a real result, a real number, a real customer. Only if one
     exists; do not invent a testimonial.
   - **Offer** — the concrete thing and its price or term.
   Label what each is betting on.
3. **Per angle give**: a headline under about 40 characters, body of two or
   three short lines, and one call to action that names what happens next
   ("Escribinos por WhatsApp" beats "Más info").
4. **The creative.** Describe the image or video in one line — what is in
   frame, what the text overlay says. Then run find_media to see whether the
   library already has something usable and name the file if so. This agent
   cannot generate the image here.
5. **Say what to measure.** One number per angle, and where the owner reads it
   back: cost per lead in the ads view, form completions in the forms view.

## Rules for the writing

- Short. Meta truncates, and the truncation lands mid-sentence.
- One idea per ad. An ad listing four benefits sells none of them.
- No superlatives the business cannot back — "el mejor", "líder", "número 1".
- No urgency that is not real. A deadline invented for pressure is a lie that
  the next ad has to repeat.
- Match the language of the audience, including the register. Most of this
  account's customers write informally; the ad should too.
- Never claim a result, a rating, or a customer count that is not in the
  knowledge base or the CRM.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
