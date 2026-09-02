import { defineSchedule } from "eve/schedules";
import { scheduleCron } from "../../lib/schedule-cron";
import { cronMatches } from "../../lib/automation-engine";
import { runAutomationSteps } from "../../lib/automation-runner";
import { listAutomations, recordAutomationFire } from "../../lib/business-store";

/**
 * Fire automations whose trigger is a cron expression.
 *
 * The Automations UI has offered `schedule` as a trigger, with a cron field
 * beside it, for as long as the page has existed — and nothing ever ran one.
 * `cronMatches` was written and unit-tested but called from nowhere, so a
 * scheduled automation sat there active and silent. This is its missing half.
 *
 * A scheduled run has no one in the conversation, so it runs with no contact,
 * exactly like the webhook route: steps that need a contact skip themselves,
 * steps that need the agent's judgement are deferred. What is left — notify
 * the team, call a webhook, log a row — is the part a clock can meaningfully
 * drive.
 *
 * Ticking every minute, against a minute-granular cron, means one run per
 * matching minute. Same assumption as agent/schedules/followups.ts.
 */
export default defineSchedule({
  cron: scheduleCron("automations", "* * * * *"),
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        const now = new Date();
        const due = (await listAutomations()).filter(
          (auto) =>
            auto.status === "active" &&
            auto.trigger === "schedule" &&
            cronMatches(auto.triggerValue ?? "", now),
        );

        for (const auto of due) {
          await recordAutomationFire(auto.id);
          const outcomes = await runAutomationSteps(auto.steps ?? [], undefined);
          const failed = outcomes.filter((outcome) => outcome.status === "failed");
          if (failed.length > 0) {
            // Nobody is watching a cron run, so a refusal that is only in the
            // return value is a refusal nobody ever sees.
            console.warn("[automations] scheduled run had failures", {
              automation: auto.id,
              failed: failed.map((outcome) => `${outcome.type}: ${outcome.detail ?? ""}`),
            });
          }
        }
      })(),
    );
  },
});
