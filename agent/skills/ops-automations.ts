import { defineDynamic } from "eve/skills";
import {
  INBOX_NOTE,
  INTAKE,
  NO_INVENTION,
  OPERATIONS_NOTE,
  PLAIN_LANGUAGE,
  operatorSkill,
} from "../../lib/operator-skill";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      operatorSkill(
        ctx.channel.kind,
        "Use when the owner wants their playbooks looked at: why one never fires, why " +
          "one fires when it should not, whether they overlap, or which ones are worth " +
          "having at all.",
        `# The playbooks

An automation in Senka is a trigger plus steps. This skill audits the ones that
exist and fixes the ones that are wrong.

## The sentence to get right

propose_automation and propose_automation_update create and edit **drafts**. A
draft never runs and never messages anybody until the owner activates it from
the Automations page. So it is always "te dejé el borrador", never "lo
automaticé". Getting this wrong makes the owner believe customers are being
answered when nobody is.

propose_automation_update refuses anything that is not currently a draft. An
active or paused automation was already approved and may be running; it has to
be paused in the app first.

## When to use

- "por qué no se dispara", "revisá mis automatizaciones".
- "se manda cuando no tiene que mandarse".
- "cuáles me sirven".

## When NOT to use

- Designing a campaign's sequence from scratch — that is the marketing
  campaign skill, which calls this one for the wiring.

${INTAKE}

${OPERATIONS_NOTE}

${INBOX_NOTE}

## Audit

operations action=automations, then judge each against five faults. Check them
in this order; the first two cause most complaints.

1. **Never fired.** neverFired is true and the status is active. The trigger
   does not match reality. For a keyword trigger, prove it: search the archive
   (inbox action=search) for the keywords and see whether any customer has ever
   written them. Customers write "cuanto sale", not "cotización". Propose the
   words they actually use, taken from the archive rather than invented.
2. **No way out.** endsInHandoff is false on a customer-facing playbook. If
   none of its branches can reach a person, somebody will get stuck in it. Say
   which playbook and what a stuck customer experiences.
3. **Overlapping triggers.** Two active playbooks whose keywords share a word,
   or two new_chat playbooks on the same channel. Say which message would
   match both and what the customer would receive.
4. **Too broad.** A keyword list with a word that appears in ordinary
   sentences — "hola", "si", "gracias". Every false fire is a customer
   receiving a reply about something they never asked.
5. **Stale.** Active, fired once months ago, never since. Not broken, just
   noise in the list. Say so and let the owner pause it.

Report worst first, each with: the playbook's name, the fault, the evidence,
and the one change. Cap at five.

## Fixing

1. Fix one at a time and say what changed.
2. Where it is a draft, propose_automation_update. Where it is active or
   paused, say plainly that it has to be paused in the app first — do not
   create a second playbook that does nearly the same thing, which is how an
   account ends up with three overlapping welcome messages.
3. After proposing, restate: what fires it, what it sends, what it does not
   cover, and that it is a draft awaiting activation.

## Whether a playbook should exist

Before building one, three questions, and a no to any is a no:

- **Does it repeat?** Under about five real occurrences in the archive, it is
  not a pattern yet.
- **Is the answer the same every time?** If it varies, an automation sends the
  wrong one at scale.
- **Is a wrong send survivable?** Anything about money owed, an apology for a
  real failure, or an exception gets a person. The cost of a wrong automated
  message there is a customer, not a minute.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
