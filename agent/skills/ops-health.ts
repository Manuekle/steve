import { defineDynamic } from "eve/skills";
import {
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
        "Use when the owner asks whether everything is working, why nothing seems to be " +
          "happening, what is broken, what is piling up, or wants a weekly check of the " +
          "whole setup.",
        `# Is everything working

The other skills read the business. This one reads the machine running it:
playbooks, integrations, and the work nobody has picked up. Two shapes:

- **check** — the default. Is anything broken or silently off.
- **bottlenecks** — where work is piling up, and why.

## When to use

- "está todo funcionando", "por qué no pasa nada".
- "revisión semanal del sistema".
- "se me acumula todo en un lugar".

## When NOT to use

- Sales or support numbers — those are their own briefs.
- Deep work on one playbook — that is the automations skill.

${INTAKE}

${OPERATIONS_NOTE}

## check

Four reads, in this order, because the first two are where silent failure
lives:

1. **operations action=connections.** Anything with status needs_reconnect is
   the highest-priority finding on this list: it was working, it stopped, and
   nothing told the owner. A Google connection that expired takes the calendar
   and the sheets with it. Report each by name with what it disables.
   Status disconnected is "never set up" and unavailable is "this
   installation cannot offer it" — three different sentences, not one.
2. **operations action=automations.** The number that matters is
   activeNeverFired: a playbook switched on that has never once matched. Name
   each one and its trigger. A keyword automation that never fires almost
   always has the wrong keywords.
   Also flag: active playbooks that have not fired in 30+ days, drafts nobody
   activated, and any customer-facing playbook where endsInHandoff is false —
   that one traps whoever it catches.
3. **operations action=queue.** People waiting on a person, follow-ups due,
   reminders that are pending but whose moment has passed, reminders that
   failed. An overdue pending reminder means the schedule did not run, which
   is an installation problem, not a queue problem — say which.
4. **operations action=usage** with days=7, only to notice a cost that jumped.
   Detail belongs in the costs skill.

Report as: **what is broken**, **what is switched on but doing nothing**,
**what is waiting on you**, then a one-line all-clear for everything checked
and fine. Naming what is fine matters — an owner who only ever gets problems
stops believing the report.

## bottlenecks

A bottleneck is where work arrives faster than it leaves. Find it, do not
guess it:

1. operations action=queue for the counts and the oldest wait.
2. The three usual ones in this app, checked in order:
   - **Everything ends up with a person.** A high waitingForHuman against
     total conversations means the bot cannot answer, which is a knowledge
     gap. Point at the support docs skill.
   - **Nothing is followed up.** Contacts sitting open with no reminder and no
     no_reply playbook. The follow-up does not exist, so it never happens.
   - **The owner is the only step.** Every playbook ends at transfer_human and
     nothing resolves without them.
3. Name **one** bottleneck. Say what evidence points at it, what it costs in
   the numbers actually seen, and the single change that would relieve it.
   A list of five bottlenecks is a list of none.
4. Say what could not be measured: this app has no per-person timing, so
   "slow" is inferred from how long things sit, not from how long they take.

${NO_INVENTION}

${PLAIN_LANGUAGE}`,
      ),
  },
});
