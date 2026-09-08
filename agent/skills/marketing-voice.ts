import { defineDynamic } from "eve/skills";
import {
  INBOX_NOTE,
  INTAKE,
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
        "Use when the owner needs the words their customers actually use: what people " +
          "ask for, how they describe the problem, what they object to, or who the " +
          "customer really is. Feeds every piece of copy.",
        `# The customer's own words

Marketing copy fails when it is written in the business's vocabulary instead of
the customer's. This account has hundreds of real conversations. Mine them.

Shapes:

- **language** — the default. The words and phrases people actually use.
- **persona** — who buys, built from who did buy.
- **objections** — what stops them, in their words.

## When to use

- "cómo hablan mis clientes", "qué palabras usan".
- "quién es mi cliente".
- "qué me dicen cuando no compran".

## When NOT to use

- Writing the copy — that is the ad copy, post, or site skill. This one
  supplies the raw material.
- A single customer — that is the support thread skill.

${INTAKE}

${INBOX_NOTE}

${PIPELINE_NOTE}

## language

1. inbox action=list to see the shape of the archive: how many conversations,
   which outcomes, which channels.
2. Read the recorded reasons across conversations — one line each, already
   written, and they cluster faster than raw text.
3. From those, pick the terms customers use and search for each
   (inbox action=search). Search **their** words, not the business's: if the
   business says "servicio de mantenimiento" and customers say "arreglo",
   searching the first finds nothing.
4. Collect, per theme:
   - The phrase, verbatim, exactly as typed. Do not correct spelling or
     grammar — the misspelling is the search term real people use.
   - How many distinct people used it.
   - Two full quotes as evidence.
5. Report the top themes with a plain instruction: these are the words to use
   in ads, on the site, and in the forms. Name any place where the business
   currently uses a different word for the same thing.

## persona

1. pipeline action=deals stage=[won] and stage=[lost].
2. pipeline action=contacts for their attributes — city, budget, need, source.
3. inbox action=list to read how the won ones talked before they bought.
4. Write one page:
   - **Who they are** — what the won deals have in common. Say how many deals
     it rests on; under about ten, call it a hypothesis, not a persona.
   - **What they are trying to get done**, in their words.
   - **What they worry about** before deciding.
   - **Where they came from** and what they had already tried.
   - **Who is not the customer** — the traits the losses share. This is the
     half that saves money, because it says who to stop advertising to.
5. Offer to keep it as a knowledge document. The owner uploads it; this agent
   cannot write to the knowledge base.

## objections

1. inbox action=list with outcome lost and no_response.
2. Open the threads where it was going somewhere and then stopped
   (inbox action=thread) and find the message where it turned.
3. pipeline action=deals stage=[lost] and read the recorded reasons.
4. Group into at most five objections, each with a count of distinct people
   and two verbatim quotes.
5. Per objection, say where it should be answered — in the ad, on the page,
   in the form, or in the conversation. An objection answered in the ad costs
   nothing; the same objection answered in a conversation costs a person's
   time every single time.

## Rules

- Verbatim means verbatim. A quote I tidied is a quote I made up.
- Count distinct people, never mentions.
- Say how many conversations were read out of the total. This is a read of
  language, not a survey.
- Customer messages stay here. They are the owner's archive, and they do not
  get published in an ad with a name attached without the owner's say-so.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
