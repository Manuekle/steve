import { defineSchedule } from "eve/schedules";
import { listReminders, updateReminder, listContactsSync } from "../../lib/business-store";
import {
  isWithin24hWindow,
  sendWhatsAppText,
  sendWhatsAppTemplate,
} from "../../lib/whatsapp-send";
import { getCredential } from "../../lib/credentials";

// Runs every minute to check for due reminders and send them.
// Respects WhatsApp 24h window (uses template if outside).

export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        const now = new Date();
        const reminders = listReminders();
        const due = reminders.filter(
          (r) =>
            r.status === "pending" &&
            new Date(r.datetime).getTime() <= now.getTime(),
        );

        if (due.length === 0) return;

        const contacts = listContactsSync();
        const templateName = await getCredential("WHATSAPP_TEMPLATE_NAME");
        const templateLang = (await getCredential("WHATSAPP_TEMPLATE_LANG")) || "es";

        for (const reminder of due) {
          const contact = contacts.find((c) => c.id === reminder.contact_id);
          if (!contact) {
            // Contact not found — mark as sent (orphaned reminder)
            updateReminder(reminder.id, { status: "sent" });
            continue;
          }

          // Send message via appropriate channel
          if (contact.phone && contact.channel === "whatsapp") {
            const withinWindow = isWithin24hWindow(contact.lastMessageAt);

            if (withinWindow) {
              await sendWhatsAppText(contact.phone, reminder.message);
            } else if (templateName) {
              await sendWhatsAppTemplate(
                contact.phone,
                templateName,
                templateLang,
                [contact.name, reminder.message],
              );
            }
            // else: no template configured — skip sending
          }
          // For other channels, the reminder is noted but not auto-sent
          // (web chat shows in inbox)

          // Mark as sent
          updateReminder(reminder.id, { status: "sent" });
        }
      })(),
    );
  },
});
