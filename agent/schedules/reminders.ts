import { defineSchedule } from "eve/schedules";
import { scheduleCron } from "../../lib/schedule-cron";
import { listReminders, updateReminder, listContacts } from "../../lib/business-store";
import { replyToContact } from "../../lib/automation-runner";
import type { Contact, Reminder } from "../../lib/types";

/**
 * Deliver reminders that have come due, once a minute.
 *
 * Delivery goes through `replyToContact`, the same function the automation
 * runner and the follow-up schedule use: WhatsApp free-form inside the 24h
 * window, an approved template outside it, an Instagram DM for an Instagram
 * contact. This file used to carry its own WhatsApp-only copy of that logic,
 * so an Instagram contact's reminder was silently never sent.
 *
 * The other half of that silence was the status. Every reminder here was
 * marked `sent` regardless of what happened — no contact, no transport, no
 * template, a token Meta refused — so the reminders page showed a green
 * "enviado" badge for a person who was never reminded. Now only a delivery
 * that actually left marks `sent`; everything else marks `failed`, which is
 * the one state an operator can act on.
 *
 * Nothing retries. A reminder is tied to a moment ("llamalo el martes a las
 * 10"), and re-sending it an hour later is usually worse than not sending it,
 * so a failure is surfaced rather than queued.
 */
export default defineSchedule({
  cron: scheduleCron("reminders", "* * * * *"),
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        const now = Date.now();
        const reminders = await listReminders();
        const due = reminders.filter(
          (reminder) =>
            reminder.status === "pending" && new Date(reminder.datetime).getTime() <= now,
        );
        if (due.length === 0) return;

        const contacts = await listContacts();
        const byId = new Map<string, Contact>(contacts.map((contact) => [contact.id, contact]));

        for (const reminder of due) {
          const contact = byId.get(reminder.contact_id);
          await updateReminder(reminder.id, { status: await deliver(reminder, contact) });
        }
      })(),
    );
  },
});

/** What this reminder's status should become. Never throws: one contact's
 *  broken channel must not stop the rest of the minute's reminders. */
async function deliver(reminder: Reminder, contact: Contact | undefined): Promise<"sent" | "failed"> {
  if (!contact) {
    // The contact was deleted after the reminder was set. There is nobody to
    // remind, and that is a failure to report, not a delivery.
    console.warn("[reminders] no contact for reminder", { reminder: reminder.id });
    return "failed";
  }

  try {
    const sent = await replyToContact(contact, reminder.message);
    if (!sent) {
      // A form lead or a phone caller: real contacts, no outbound transport.
      // The reminder still stands — it is now the operator's to action from
      // the reminders page, which is exactly what "failed" tells them.
      console.warn("[reminders] no outbound channel", {
        reminder: reminder.id,
        contact: contact.id,
        channel: contact.channel,
      });
      return "failed";
    }
    if (!sent.ok) {
      console.warn("[reminders] not delivered", { reminder: reminder.id, detail: sent.detail });
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.warn("[reminders] delivery threw", { reminder: reminder.id, error });
    return "failed";
  }
}
