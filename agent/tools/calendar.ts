import { defineTool } from "eve/tools";
import { z } from "zod";
import { checkCalendarSlots, bookCalendarEvent } from "../../lib/calendar";
import { assertToolAllowed } from "../../lib/agent-scope";
import { getContactBySession } from "../../lib/business-store";

// Eve tool for checking calendar availability and booking events.
//
// Two things this deliberately does not make the model get right on its own:
//
//   The end time. `end` is still accepted, but `duration_min` is what a person
//   actually says out loud ("media hora el martes"), and a model doing date
//   arithmetic in its head is a booking at the wrong time.
//
//   The attendee. The session already knows who this is, so an omitted
//   `contact_email` falls back to the contact's — otherwise a booking made in
//   a conversation with a known customer went into the calendar with nobody
//   invited to it.
//
// Both Google calls throw on a missing or refused credential. Those are
// returned as sentences rather than allowed to escape: a thrown tool leaves
// the model with nothing to say, and what it says instead is usually that the
// appointment is booked.

export default defineTool({
  description:
    "Check Google Calendar availability and book events. Use when the " +
    "user wants to schedule an appointment, check available times, or " +
    "book a meeting. Always check availability before offering a time, and " +
    "only say an appointment is booked once book_event has answered success.",
  inputSchema: z.object({
    action: z.enum(["check_slots", "book_event"]),
    start: z.string().optional().describe("Start datetime (ISO format) for checking slots or booking"),
    end: z.string().optional().describe("End datetime (ISO format). For booking, prefer duration_min."),
    duration_min: z
      .number()
      .optional()
      .describe("Minutes: the slot length when checking, the meeting length when booking. Default 30."),
    summary: z.string().optional().describe("Event title for booking"),
    description: z.string().optional().describe("Event description for booking"),
    contact_email: z
      .string()
      .optional()
      .describe("Attendee email. Leave out to invite this conversation's contact."),
    with_meet: z
      .boolean()
      .optional()
      .describe("Attach a Google Meet video link to the booking. Defaults to true."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    slots: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
    event_id: z.string().optional(),
    link: z.string().optional(),
    meet_link: z.string().optional(),
    message: z.string(),
  }),
  async execute(input, ctx) {
    await assertToolAllowed(ctx.session.id, "calendar");
    const durationMin = input.duration_min ?? 30;

    if (input.action === "check_slots") {
      if (!input.start || !input.end) {
        return { success: false, message: "start and end are required for checking slots." };
      }
      try {
        const slots = await checkCalendarSlots({
          start: input.start,
          end: input.end,
          durationMin,
        });
        return {
          success: true,
          slots,
          message:
            slots.length === 0
              ? "No free slots in that range. Offer to look at other dates."
              : `Found ${slots.length} available slot(s).`,
        };
      } catch (error) {
        return { success: false, message: reason(error) };
      }
    }

    if (input.action === "book_event") {
      if (!input.start || !input.summary) {
        return { success: false, message: "start and summary are required for booking." };
      }
      const start = new Date(input.start);
      if (Number.isNaN(start.getTime())) {
        return { success: false, message: "start is not a valid datetime. Use ISO format." };
      }
      if (start.getTime() <= Date.now()) {
        return { success: false, message: "That time is in the past. Ask for a future one." };
      }
      // `end` still wins when the model bothered to work it out; otherwise the
      // duration decides, which is what the person actually said.
      const end = input.end ?? new Date(start.getTime() + durationMin * 60_000).toISOString();

      try {
        const result = await bookCalendarEvent({
          start: input.start,
          end,
          summary: input.summary,
          description: input.description,
          contactEmail:
            input.contact_email ?? (await getContactBySession(ctx.session.id))?.email,
          withMeet: input.with_meet,
        });
        return {
          success: true,
          event_id: result.event_id,
          link: result.link,
          meet_link: result.meetLink,
          message: result.meetLink
            ? "Event booked successfully, with a Google Meet link."
            : "Event booked successfully.",
        };
      } catch (error) {
        return { success: false, message: reason(error) };
      }
    }

    return { success: false, message: "Invalid action." };
  },
});

/** What went wrong, plus the one instruction that matters after a failed
 *  booking: do not tell them it worked. */
function reason(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Calendar unavailable: ${detail} Tell the person you could not confirm it, and never claim the appointment was booked.`;
}
