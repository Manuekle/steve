import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  upsertContact,
  listContacts,
  normalizePhone,
} from "../../lib/business-store";
import { assertToolAllowed } from "../../lib/agent-scope";

export default defineTool({
  description:
    "Update an existing contact by id, phone, or email. Use this to add notes, " +
    "set attributes, or change status for a contact that is NOT the current session. " +
    "For the current session's contact, use upsert_contact instead. " +
    "Use appendNotes=true to append notes instead of replacing.",
  inputSchema: z.object({
    contactId: z
      .string()
      .optional()
      .describe("Contact id (ct-...). Preferred lookup."),
    phone: z
      .string()
      .optional()
      .describe("Phone number to match if contactId is not provided."),
    email: z
      .string()
      .optional()
      .describe("Email to match if contactId and phone are not provided."),
    name: z.string().optional().describe("Update the contact's display name."),
    notes: z
      .string()
      .optional()
      .describe("The contact's notes. Use appendNotes=true to append instead of replace."),
    appendNotes: z
      .boolean()
      .optional()
      .describe("If true, append notes to existing notes (separated by newline). Default: replace."),
    attributes: z
      .record(z.string(), z.string())
      .optional()
      .describe("Merge these key-value pairs into the contact's attributes."),
    status: z
      .enum(["open", "waiting_human", "followup_due", "closed"])
      .optional()
      .describe("Change the contact's lifecycle status."),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    contactId: z.string().optional(),
    name: z.string().optional(),
    error: z.string().optional(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "update_contact");
    // Resolve the contact to update.
    let contactId = input.contactId;

    if (!contactId) {
      const contacts = await listContacts();
      const normalizedPhone = normalizePhone(input.phone);
      const match = contacts.find((c) => {
        if (normalizedPhone && normalizePhone(c.phone) === normalizedPhone) return true;
        if (input.email && c.email && c.email.toLowerCase() === input.email.toLowerCase())
          return true;
        return false;
      });
      if (!match) {
        return {
          found: false,
          error: `No contact found with phone=${input.phone ?? "none"} email=${input.email ?? "none"}`,
        };
      }
      contactId = match.id;
    }

    // Resolve notes: append or replace
    let notes = input.notes;
    if (input.appendNotes && input.notes) {
      const contacts = await listContacts();
      const existing = contacts.find((c) => c.id === contactId);
      const prev = existing?.notes?.trim();
      notes = prev ? `${prev}\n${input.notes}` : input.notes;
    }

    const updated = await upsertContact({
      id: contactId,
      name: input.name,
      notes,
      attributes: input.attributes,
      status: input.status,
    });

    return { found: true, contactId: updated.id, name: updated.name };
  },
});
