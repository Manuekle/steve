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
        "Use when the owner wants to know how support is going overall: whether the " +
          "bot is doing its job, how often it hands over, what improved or got worse, " +
          "or what support still needs in order to work.",
        `# How support is going

The weekly readout, and the audit of what support is missing. Two shapes:

- **review** — the default. How the week went.
- **audit** — what is missing for support to work at all.

## When to use

- "cómo viene soporte", "revisión semanal".
- "el bot está sirviendo".
- "qué le falta para atender bien".

## When NOT to use

- Today's queue — that is the support queue skill.
- Money — that is the sales brief.

${INTAKE}

${INBOX_NOTE}

${PIPELINE_NOTE}

## review

1. inbox action=list across everything. Then the same filtered to outcome
   support, and to no_response.
2. pipeline action=contacts status=waiting_human — who is still flagged.
3. Compute and report only what the data supports:
   - **Volume** — conversations touched, by channel.
   - **Handover rate** — how many were flagged for a person, as a fraction.
     This is the single number that says whether the bot is working.
   - **Still waiting** — flagged and never answered, with the longest wait.
     Name the person.
   - **Went quiet mid-problem** — no_response on conversations that had
     reached support.
   - **Unassessed** — how many Steve has not classified, so the reader knows
     what the rest of the numbers exclude.
4. **Compare against last time** if this conversation has an earlier review.
   If not, say this is the baseline. Never imply a trend from one reading.
5. **Three things to do**, each naming a person or a document. If the week was
   quiet, say so in one line and stop — a padded review trains the owner to
   skip it.

## audit

Check five things and report each as present, thin, or missing. Check, do not
assume.

1. **Answers.** search_knowledge for the three questions the archive shows
   most often. Nothing coming back is why the bot hands over, and it is the
   finding that matters most. Name the missing document.
2. **Contact details and hours.** Whether the business identity is filled in —
   the agent hands those to customers verbatim.
3. **Handover rules.** list_automations for anything that routes to a person.
   None means every handover is the model's judgement call, unassisted.
4. **Follow-up.** Whether a no_reply automation exists and is active. Without
   one, everybody who goes quiet stays quiet.
5. **Coverage.** Which channels have conversations, and whether any channel is
   receiving messages nobody has looked at.

Report as one list, ordered by what unlocks the most: what is missing, what it
breaks in concrete terms, and where to fix it in the app's own words. Then
stop — an audit is not a questionnaire, and five questions in one message is
how it gets abandoned.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
