import { defineDynamic } from "eve/skills";
import {
  INBOX_NOTE,
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
        "Use when the owner needs organic content: a post for Instagram or social, a " +
          "plan for the week, an existing piece reshaped into another format, or a " +
          "customer result written up as proof.",
        `# Organic content

Drafts only — nothing here publishes. Shapes:

- **post** — the default. One piece for one place.
- **week** — a week's plan, per channel.
- **repurpose** — something that exists, reshaped.
- **proof** — a real customer result, written up.

## When to use

- "escribí un post", "qué publico esta semana".
- "convertí esto en un carrusel".
- "contá el caso de [cliente]".

## When NOT to use

- Paid ads — that is the ad copy skill.
- A message to one customer — that is outreach or the support reply skill.

${INTAKE}

${MARKETING_NOTE}

${INBOX_NOTE}

${PIPELINE_NOTE}

## Where the material comes from

Never from imagination. In order:

1. **Real questions.** inbox action=search or the recorded reasons across
   conversations. A question five people asked is a post with a guaranteed
   audience, and the answer is already written in the replies.
2. **Real results.** pipeline action=deals stage=[won] — what the business
   actually delivered.
3. **The knowledge base.** search_knowledge for the facts, prices and terms
   that go in it.
4. **The media library.** find_media for photos that already exist. Real photos
   of real work beat anything described in a brief.

## post

1. Confirm the channel. Instagram caption, story, WhatsApp status and a
   newsletter are different lengths and different registers; ask if it is not
   obvious.
2. Open on the customer's problem in their words, not on the business.
3. One idea. Say the useful thing outright rather than teasing it.
4. End with what to do — and only if there is a real next step. A post that
   ends "escribinos" every time trains people to skip the ending.
5. Describe the image in one line, and name a library file if find_media
   returns one that fits.
6. Give it in the language the audience uses.

## week

Five days, not seven. Mixed on purpose:

- Two that answer a real question from the archive, named.
- One that shows work: a result, a before and after, a delivery.
- One that is the offer, said plainly. A feed with no offer sells nothing.
- One reply, comment, or story that costs no production.

Per slot: the day, the channel, the idea in one line, and where the material
comes from. No filler slots — four real posts beat seven invented ones, and
say so rather than padding.

## repurpose

1. Read the source: web_fetch for a URL, or what the owner pastes.
2. Find the single strongest idea in it, not a summary of all of them.
3. Rewrite it native to the destination. A blog paragraph pasted into
   Instagram is a blog paragraph on Instagram.
4. Keep every fact identical. Repurposing that drifts on a number is how a
   wrong price ends up in three places.

## proof

1. Pick the deal (pipeline action=deals stage=[won]) and read what happened
   (inbox action=thread).
2. Write four short parts: what they needed, what was done, what changed, and
   one line in the customer's own words if the archive has one.
3. **Real numbers only.** If the result was never measured, say what was
   delivered without a number rather than inventing one.
4. **Ask before naming anyone.** A customer's name, photo or words in public
   marketing needs their permission, and this agent has no record of consent.
   Draft it anonymised, and say plainly that the owner has to ask them before
   publishing.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
