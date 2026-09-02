import { defineTool } from "eve/tools";
import { z } from "zod";
import { checkCalendarSlots, bookCalendarEvent } from "../../lib/calendar";
import { assertToolAllowed } from "../../lib/agent-scope";

// Eve tool for checking calendar availability and booking events.

export default defineTool({
  description:
    "Check Google Calendar availability and book events. Use when the " +
    "user wants to schedule an appointment, check available times, or " +
    "book a meeting.",
  inputSchema: z.object({
    action: z.enum(["check_slots", "book_event"]),
    start: z.string().optional().describe("Start datetime (ISO format) for checking slots or booking"),
    end: z.string().optional().describe("End datetime (ISO format) for checking slots or booking"),
    duration_min: z.number().optional().describe("Duration in minutes for slot checking (default: 30)"),
    summary: z.string().optional().describe("Event title for booking"),
    description: z.string().optional().describe("Event description for booking"),
    contact_email: z.string().optional().describe("Attendee email for booking"),
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
    if (input.action === "check_slots") {
      if (!input.start || !input.end) {
        return { success: false, message: "start and end are required for checking slots." };
      }
      const slots = await checkCalendarSlots({
        start: input.start,
        end: input.end,
        durationMin: input.duration_min ?? 30,
      });
      return {
        success: true,
        slots,
        message: `Found ${slots.length} available slot(s).`,
      };
    }

    if (input.action === "book_event") {
      if (!input.start || !input.end || !input.summary) {
        return { success: false, message: "start, end, and summary are required for booking." };
      }
      const result = await bookCalendarEvent({
        start: input.start,
        end: input.end,
        summary: input.summary,
        description: input.description,
        contactEmail: input.contact_email,
        withMeet: input.with_meet,
      });
      return {
        success: true,
        event_id: result.event_id,
        link: result.link,
        meet_link: result.meetLink,
        message: result.meetLink
          ? `Event booked successfully, with a Google Meet link.`
          : `Event booked successfully.`,
      };
    }

    return { success: false, message: "Invalid action." };
  },
});
