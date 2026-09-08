import { defineTool } from "eve/tools";
import { z } from "zod";
import { setReminder, listRemindersForContact, deleteReminderById } from "../../lib/reminder";
import { assertToolAllowed } from "../../lib/agent-scope";
import { getContactBySession, upsertContact } from "../../lib/business-store";

// Eve tool for managing contact reminders.
//
// `contact_id` is optional and almost never supplied: the model is talking to
// the person, not looking at a database, so asking it for an internal id was
// asking for either a refusal ("contact_id is required") or an invention. The
// session already knows who this is — the playbook injects the contact each
// turn — so the id is resolved here, and a session with no contact record yet
// gets one created rather than losing the reminder.

export default defineTool({
  description:
    "Set, list, or delete reminders for the person in this conversation. Use " +
    "when they want to be reminded about something, or when you need to " +
    "schedule a follow-up at a specific time. You do not need their contact " +
    "id: leave it out and this conversation's contact is used.",
  inputSchema: z.object({
    action: z.enum(["set", "list", "delete"]),
    contact_id: z
      .string()
      .optional()
      .describe("Only for a reminder about someone other than the person you are talking to."),
    datetime: z.string().optional().describe("Reminder datetime (ISO format) for setting"),
    message: z.string().optional().describe("Reminder message for setting"),
    reminder_id: z.string().optional().describe("Reminder ID for deleting"),
  }),
  // `reminders` has to be declared here or the list action answers with a
  // count and nothing to count: eve validates the output against this schema,
  // so an undeclared field never reaches the model.
  outputSchema: z.object({
    success: z.boolean(),
    reminder_id: z.string().optional(),
    count: z.number().optional(),
    reminders: z
      .array(
        z.object({
          id: z.string(),
          datetime: z.string(),
          message: z.string(),
          status: z.string(),
        }),
      )
      .optional(),
    message: z.string(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "reminder");
    if (input.action === "set") {
      if (!input.datetime || !input.message) {
        return { success: false, message: "datetime and message are required." };
      }
      const contactId = input.contact_id ?? (await resolveContactId(ctx.session.id));
      try {
        const result = await setReminder({
          contact_id: contactId,
          datetime: input.datetime,
          message: input.message,
        });
        return {
          success: true,
          reminder_id: result.reminder_id,
          message: result.message,
        };
      } catch (error) {
        // A date in the past or an unparseable one: a sentence the model can
        // act on ("ask them for another time") beats a thrown tool error.
        return {
          success: false,
          message: error instanceof Error ? error.message : "Could not set the reminder.",
        };
      }
    }

    if (input.action === "list") {
      // No id and no contact yet is a legitimate "nothing to list", so this
      // one does not create a record just to answer a question.
      const result = await listRemindersForContact({
        contact_id: input.contact_id ?? (await getContactBySession(ctx.session.id))?.id,
      });
      return {
        success: true,
        reminders: result.reminders.map((reminder) => ({
          id: reminder.id,
          datetime: reminder.datetime,
          message: reminder.message,
          status: reminder.status,
        })),
        count: result.count,
        message: `Found ${result.count} reminder(s).`,
      };
    }

    if (input.action === "delete") {
      if (!input.reminder_id) {
        return { success: false, message: "reminder_id is required for deleting." };
      }
      try {
        const result = await deleteReminderById({ reminder_id: input.reminder_id });
        return { success: true, message: result.message };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Could not delete the reminder.",
        };
      }
    }

    return { success: false, message: "Invalid action." };
  },
});

/** The contact this session belongs to, created if this is the first thing
 *  the conversation has persisted. A reminder is worth a contact record. */
async function resolveContactId(sessionId: string): Promise<string> {
  const existing = await getContactBySession(sessionId);
  if (existing) return existing.id;
  const created = await upsertContact({ sessionId, source: "reminder" });
  return created.id;
}
