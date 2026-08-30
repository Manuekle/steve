import { getCredential } from "./credentials";
import { getGoogleToken } from "./google-auth";

// Google Calendar utility functions for checking availability and booking events.

export type CalendarSlot = {
  readonly start: string;
  readonly end: string;
};

export type CalendarEvent = {
  readonly event_id: string;
  readonly link: string;
};

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

async function getCalendarToken(): Promise<{ token: string; calendarId: string }> {
  const token = await getGoogleToken(CALENDAR_SCOPE);
  if (!token) {
    throw new Error("Connect a Google account, or set GOOGLE_SERVICE_ACCOUNT_JSON.");
  }
  // A service account has no calendar of its own, so that setup has to name
  // one. A connected account does: "primary" is the person's own calendar,
  // which is what they meant by connecting it.
  const calendarId = (await getCredential("GOOGLE_CALENDAR_ID")) ?? "primary";
  return { token, calendarId };
}

/**
 * Check available time slots in a date range.
 * Returns gaps between existing events that are at least `durationMin` minutes long.
 */
export async function checkCalendarSlots(opts: {
  readonly start: string;
  readonly end: string;
  readonly durationMin: number;
}): Promise<CalendarSlot[]> {
  const { token, calendarId } = await getCalendarToken();

  // Fetch existing events in the range
  const timeMin = encodeURIComponent(opts.start);
  const timeMax = encodeURIComponent(opts.end);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Calendar API ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    items?: Array<{ start?: { dateTime?: string }; end?: { dateTime?: string } }>;
  };

  const events = data.items ?? [];
  const slots: CalendarSlot[] = [];
  const rangeStart = new Date(opts.start).getTime();
  const rangeEnd = new Date(opts.end).getTime();
  const durationMs = opts.durationMin * 60 * 1000;

  // Sort events by start time
  const sorted = events
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .sort((a, b) => new Date(a.start!.dateTime!).getTime() - new Date(b.start!.dateTime!).getTime());

  // Find gaps between events
  let current = rangeStart;

  for (const event of sorted) {
    const eventStart = new Date(event.start!.dateTime!).getTime();
    const eventEnd = new Date(event.end!.dateTime!).getTime();

    // Gap before this event
    if (eventStart - current >= durationMs) {
      slots.push({
        start: new Date(current).toISOString(),
        end: new Date(eventStart).toISOString(),
      });
    }

    current = Math.max(current, eventEnd);
  }

  // Gap after last event
  if (rangeEnd - current >= durationMs) {
    slots.push({
      start: new Date(current).toISOString(),
      end: new Date(rangeEnd).toISOString(),
    });
  }

  return slots;
}

/**
 * Book a calendar event.
 * Creates a new event in the specified calendar.
 */
export async function bookCalendarEvent(opts: {
  readonly start: string;
  readonly end: string;
  readonly summary: string;
  readonly description?: string;
  readonly contactEmail?: string;
}): Promise<CalendarEvent> {
  const { token, calendarId } = await getCalendarToken();

  const event: Record<string, unknown> = {
    summary: opts.summary,
    start: { dateTime: opts.start },
    end: { dateTime: opts.end },
  };

  if (opts.description) {
    event.description = opts.description;
  }

  if (opts.contactEmail) {
    event.attendees = [{ email: opts.contactEmail }];
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Calendar API ${response.status}: ${await response.text()}`);
  }

  const created = (await response.json()) as { id?: string; htmlLink?: string };

  return {
    event_id: created.id ?? "",
    link: created.htmlLink ?? "",
  };
}
