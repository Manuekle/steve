import { defineSchedule } from "eve/schedules";
import { automationMatchesChannel, parseDurationMs } from "../../lib/automation-engine";
import {
  listAutomations,
  listContacts,
  recordAutomationFire,
  upsertContact,
} from "../../lib/business-store";
import { getCredential } from "../../lib/credentials";
import {
  isWithin24hWindow,
  sendWhatsAppText,
  sendWhatsAppTemplate,
} from "../../lib/whatsapp-send";

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

        // Pre-read template config (shared across all sends).
        const templateName = await getCredential("WHATSAPP_TEMPLATE_NAME");
        const templateLang = (await getCredential("WHATSAPP_TEMPLATE_LANG")) || "es";

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

            // WhatsApp outbound: respect 24h free-form window.
            if (contact.channel === "whatsapp" && contact.phone) {
              const withinWindow = isWithin24hWindow(contact.lastMessageAt);
              const text = followupText(auto.name, messageStep);

              if (withinWindow) {
                // Free-form message allowed.
                await sendWhatsAppText(contact.phone, text);
              } else if (templateName) {
                // Outside window: send HSM template.
                await sendWhatsAppTemplate(
                  contact.phone,
                  templateName,
                  templateLang,
                  [contact.name, text],
                );
              }
              // else: no template configured → followup_due is set but
              // message is not sent. User sees it in inbox to handle manually.
            }
          }
        }
      })(),
    );
  },
});
