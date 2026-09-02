import { defineSchedule } from "eve/schedules";
import { scheduleCron } from "../../lib/schedule-cron";
import { getLeadForms, getLeads, getMetaAdsConfig } from "../../lib/meta-ads";
import { intakeLead } from "../../lib/lead-intake";
import { ingestedLeadIds, metaLeadToInput, selectNewLeads } from "../../lib/meta-lead-intake";
import { listContacts } from "../../lib/business-store";

/**
 * Bring Meta lead-ads submissions into the CRM, and let them trigger
 * automations.
 *
 * Meta's lead forms were readable but nothing consumed them: `getLeads` fed
 * the Ads page's table and stopped there, so somebody who filled in a lead ad
 * never reached the inbox, never became a contact, and never matched an
 * automation. The only way to act on one was to wire an outside connector into
 * a webhook-triggered automation by hand.
 *
 * Two guards keep it from surprising anyone:
 *
 * - a lead is taken in once, keyed on `meta_lead_id` (see lib/meta-lead-intake);
 * - only leads from the last day are eligible, so connecting a Page does not
 *   replay ninety days of history into the inbox.
 *
 * Anything sent from here is still the operator's own decision: `intakeLead`
 * only messages a lead when an automation they set to *active* matches it.
 */
export default defineSchedule({
  cron: scheduleCron("meta-leads", "*/5 * * * *"),
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        // No Meta account, or a Page that was never connected — lead forms
        // live on the Page node, so there is nothing to read.
        const config = getMetaAdsConfig();
        if (!config?.pageId) return;

        let forms;
        let leads;
        try {
          forms = await getLeadForms();
          leads = await getLeads(forms.map((form) => form.id));
        } catch (error) {
          // A dead token or a missing ads_read permission is a standing
          // condition, not an incident: say it once per tick and move on
          // rather than taking the schedule down.
          console.warn("[meta-leads] could not read lead forms", {
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }

        const known = ingestedLeadIds(await listContacts());
        const fresh = selectNewLeads(leads, known);
        if (fresh.length === 0) return;

        const formNames = new Map(forms.map((form) => [form.id, form.name]));
        for (const lead of fresh) {
          try {
            await intakeLead(metaLeadToInput(lead, formNames.get(lead.form_id)));
          } catch (error) {
            // One malformed lead must not block the rest of the batch.
            console.warn("[meta-leads] lead not ingested", {
              lead: lead.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })(),
    );
  },
});
