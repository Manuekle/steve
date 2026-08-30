import { defineTool } from "eve/tools";
import { z } from "zod";
import { setReminder, listRemindersForContact, deleteReminderById } from "../../lib/reminder";

// Eve tool for managing contact reminders.

export default defineTool({
  description:
    "Set, list, or delete reminders for contacts. Use when the user " +
    "wants to be reminded about something, or when you need to schedule " +
    "a follow-up at a specific time.",
  inputSchema: z.object({
    action: z.enum(["set", "list", "delete"]),
    contact_id: z.string().optional().describe("Contact ID for the reminder"),
    datetime: z.string().optional().describe("Reminder datetime (ISO format) for setting"),
    message: z.string().optional().describe("Reminder message for setting"),
    reminder_id: z.string().optional().describe("Reminder ID for deleting"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reminder_id: z.string().optional(),
    count: z.number().optional(),
    message: z.string(),
  }),
  async execute(input) {
    if (input.action === "set") {
      if (!input.contact_id || !input.datetime || !input.message) {
        return { success: false, message: "contact_id, datetime, and message are required." };
      }
      const result = await setReminder({
        contact_id: input.contact_id,
        datetime: input.datetime,
        message: input.message,
      });
      return {
        success: true,
        reminder_id: result.reminder_id,
        message: result.message,
      };
    }

    if (input.action === "list") {
      const result = await listRemindersForContact({
        contact_id: input.contact_id,
      });
      return {
        success: true,
        reminders: result.reminders,
        count: result.count,
        message: `Found ${result.count} reminder(s).`,
      };
    }

    if (input.action === "delete") {
      if (!input.reminder_id) {
        return { success: false, message: "reminder_id is required for deleting." };
      }
      const result = await deleteReminderById({
        reminder_id: input.reminder_id,
      });
      return {
        success: true,
        message: result.message,
      };
    }

    return { success: false, message: "Invalid action." };
  },
});
