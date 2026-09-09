import { defineDynamic } from "eve/skills";
import { INBOX_NOTE, INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the same support situation keeps being handled by hand and the owner " +
          "wants it turned into a playbook: an auto-reply, a follow-up, a routing rule, " +
          "or the standard steps for a recurring problem.",
        `# Turn a repeated case into a playbook

In Senka a playbook is an automation. This skill finds the case that repeats
and drafts the automation for it.

## The one thing to be honest about

propose_automation always creates a **draft**. A draft never runs and never
messages anybody until the owner opens the Automations page and activates it.
So the sentence at the end is "te dejé el borrador", never "lo automaticé".
Getting this wrong makes the owner think customers are being answered when
nobody is.

propose_automation_update only edits drafts. An active or paused automation was
already approved and may be running; it has to be paused in the app first.

## When to use

- "esto lo contesto siempre igual", "automatizá esta respuesta".
- "cuándo hay que pasarlo a una persona".
- "armá el procedimiento para cuando pasa X".

## When NOT to use

- Something that happens rarely, or where the right answer differs each time.
  An automation that is wrong a third of the time costs more than the typing
  it saved.
- Anything involving money, an exception, or an apology for a real failure.
  Those get a person.

${INTAKE}

${INBOX_NOTE}

## Steps

1. **Prove it repeats.** inbox action=search for the case, and count distinct
   people. Under about five, say so and recommend against automating it yet.
2. **Check what already exists.** list_automations, including drafts. Half of
   these requests are an automation that exists and is paused, or a draft
   nobody activated. Say so instead of creating a second one.
3. **Read how it is handled today.** Open two or three of the threads and take
   the answer that was actually sent. The automation should send what already
   works, not a rewrite of it.
4. **Pick the trigger honestly.** Senka has five:
   - **keyword** — the customer's message contains one of a list of words. Good
     for a narrow, unambiguous ask. Bad for anything a word cannot identify.
   - **new_chat** — the first message of a conversation.
   - **no_reply** — they went quiet for a set time.
   - **schedule** — a time, not an event.
   - **webhook** — another system calls in.
   If the case cannot be recognised by one of those, say so. A keyword list
   stretched to cover a fuzzy case fires on the wrong conversations, and every
   wrong fire is a customer receiving a reply about something they never asked.
5. **Draft the steps.** The useful ones here: message, wait, condition,
   ai_response, transfer_human, notify_team, notify_email, update_contact.
   Keep it short — three or four steps that always make sense beat eight that
   sometimes do.
6. **Put the escape hatch in.** Every support automation ends in either a real
   answer or transfer_human. A playbook with no way out traps the customer in
   a loop with a bot.
7. **Call propose_automation**, then report: what it does, what fires it, what
   it does not cover, and that it is a draft the owner has to activate.

## Routing rules

When the ask is "when should it go to a person" rather than "send this
automatically", do not build an automation. Write the rule in plain language,
grounded in the archive:

- The cases that must always reach a person, each with a conversation that
  proves it — anything about money owed, a real failure, or someone asking
  twice.
- The cases the bot handles well, from threads where it did.
- The words customers use when they want a human, taken from the archive
  rather than guessed. Those become the keyword list for a transfer_human
  automation.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
