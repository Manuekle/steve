import { defineDynamic } from "eve/skills";
import { INBOX_NOTE, INTAKE, NO_INVENTION, PLAIN_LANGUAGE, operatorSkill } from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner wants to know which of their conversations are worth their " +
          "time: who is actually interested, who went quiet, which chats need a person, " +
          "and what the bot is doing well or badly.",
        `# Triage the conversations

Steve already reads every real conversation and records where it left the
person commercially. This skill uses that; it does not redo it.

The outcomes it assigns: **won**, **lost**, **negotiating**, **interested**,
**no_response**, **unqualified**, **support**. Each carries the one-line reason
the classifier gave and, often, a suggested next step.

## When to use

- "qué conversaciones valen la pena", "quién está interesado".
- "quién quedó sin respuesta".
- "cómo viene atendiendo el bot".

## When NOT to use

- Money questions — the forecast reads deals, not chats.
- One specific customer — read that conversation directly.

${INTAKE}

${INBOX_NOTE}

## Steps

1. **Pull the conversations.** inbox action=list. Note
   totalMatched against how many rows came back and say which you read.
2. **Sort into what the owner should do, not into the classifier's buckets:**
   - **Answer today** — negotiating, and interested with a next step, newest
     first. This is the money.
   - **Chase** — no_response that had reached interested or negotiating before
     going quiet. A no_response that never got past hello is not a lead.
   - **Hand to a person** — the rows flagged waitingForHuman. Someone asked
     for a person and may still be waiting.
   - **Ignore** — unqualified and support. Report the counts and move on; the
     point of the classifier is that these stop costing attention.
3. **Report** at most six rows in the first two groups, each: who, what the
   classifier read, how long it has been sitting, and the one action. Then the
   counts for everything else.
4. **Offer, do not do.** Drafting a reply is the outreach skill. Setting a
   chase date is the reminder tool. Ask which.

## Reading the classifier honestly

- The outcome is a machine reading of a transcript, and it can be wrong. When a
  reason does not match what the owner says happened, trust the owner and say
  the label looks stale.
- Rows with no outcome at all have not been assessed yet — usually too short to
  judge. Report them as "sin evaluar", never as unqualified.
- A row assessed by a person outranks one assessed by the model. Say which when
  it matters.

## The pattern worth naming

If many conversations land on unqualified, the leads are wrong, not the bot. If
many land on no_response after real interest, the follow-up is missing, and
that is an automation the owner may want. If many land on support, the business
is answering the same question repeatedly and it belongs in the knowledge base.
Say which of these the numbers show, once, at the end.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
