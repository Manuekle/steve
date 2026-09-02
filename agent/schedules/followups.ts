import { defineSchedule } from "eve/schedules";
import { automationMatchesChannel, parseDurationMs } from "../../lib/automation-engine";
import {
  listAutomations,
  listContacts,
  recordAutomationFire,
  upsertContact,
} from "../../lib/business-store";
import { replyToContact } from "../../lib/automation-runner";

function followupText(autoName: string, stepsMessage: string | undefined): string {
  return stepsMessage?.trim() || `Following up from ${autoName}. Can we continue?`;
}

export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        const now = new Date();
        const [automations, contacts] = await Promise.all([
          listAutomations(),
          listContacts(),
        ]);
        const active = automations.filter((a) => a.status === "active");

        for (const auto of active) {
          if (auto.trigger !== "no_reply") continue;
          const waitMs = parseDurationMs(auto.triggerValue) ?? 30 * 60_000;
          const messageStep = auto.steps?.find((s) => s.type === "message")?.config.message;

          for (const contact of contacts) {
            if (contact.status !== "open") continue;
            if (contact.channel === "form") continue;
            if (!automationMatchesChannel(auto, contact.channel)) continue;
            const last = new Date(contact.lastMessageAt).getTime();
            if (!Number.isFinite(last) || now.getTime() - last < waitMs) continue;
            if (now.getTime() - last > waitMs + 70_000) continue;

            await upsertContact({
              id: contact.id,
              status: "followup_due",
              lastMessage: followupText(auto.name, messageStep),
              lastMessageAt: now.toISOString(),
            });
            await recordAutomationFire(auto.id);

            // Outbound on whichever channel this contact uses: WhatsApp
            // (free-form inside the 24h window, an approved template outside
            // it) or an Instagram DM. A contact with no transport, and a send
            // Meta refused, both still leave followup_due set — it shows up in
            // the inbox for someone to handle by hand.
            const sent = await replyToContact(contact, followupText(auto.name, messageStep));
            if (sent && !sent.ok) {
              console.warn("[followups] follow-up not delivered", {
                automation: auto.id,
                contact: contact.id,
                detail: sent.detail,
              });
            }
          }
        }
      })(),
    );
  },
});
