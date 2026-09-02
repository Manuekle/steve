import { randomUUID } from "node:crypto";
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
  /** Set when the event got a Google Meet conference — see `bookCalendarEvent`. */
  readonly meetLink?: string;
};

export type UpcomingEvent = {
  readonly id: string;
  readonly summary: string;
  /** ISO datetime, or just a date for an all-day event. */
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly link?: string;
  readonly meetLink?: string;
  readonly attendees: readonly string[];
};

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/** `null` means neither a connected Google account nor a service account is
 *  configured — the caller decides whether that's a thrown error (the agent
 *  tool) or a "connect Google" empty state (the Calendar page). */
async function getCalendarTokenOrNull(): Promise<{ token: string; calendarId: string } | null> {
  const token = await getGoogleToken(CALENDAR_SCOPE);
  if (!token) return null;
  // A service account has no calendar of its own, so that setup has to name
  // one. A connected account does: "primary" is the person's own calendar,
  // which is what they meant by connecting it.
  const calendarId = (await getCredential("GOOGLE_CALENDAR_ID")) ?? "primary";
  return { token, calendarId };
}

async function getCalendarToken(): Promise<{ token: string; calendarId: string }> {
  const result = await getCalendarTokenOrNull();
  if (!result) {
    throw new Error("Connect a Google account, or set GOOGLE_SERVICE_ACCOUNT_JSON.");
  }
  return result;
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
 * Creates a new event in the specified calendar, with a Google Meet
 * conference by default — `conferenceDataVersion=1` is what makes the API
 * honor `conferenceData` at all; without it Google silently drops the
 * request and the event books with no meeting link.
 */
export async function bookCalendarEvent(opts: {
  readonly start: string;
  readonly end: string;
  readonly summary: string;
  readonly description?: string;
  readonly contactEmail?: string;
  readonly withMeet?: boolean;
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

  const withMeet = opts.withMeet ?? true;
  if (withMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${withMeet ? "?conferenceDataVersion=1" : ""}`;

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

  const created = (await response.json()) as { id?: string; htmlLink?: string; hangoutLink?: string };

  return {
    event_id: created.id ?? "",
    link: created.htmlLink ?? "",
    meetLink: created.hangoutLink,
  };
}

/**
 * Events on the calendar between `start` and `end`, for the Calendar page —
 * a read-only view of what `calendar`'s `book_event` action (and anyone
 * booking straight in Google Calendar) has put there. `null` means no Google
 * identity is configured at all; an empty array means the calendar is just
 * clear for that range.
 */
export async function listUpcomingEvents(opts: {
  readonly start: string;
  readonly end: string;
  readonly maxResults?: number;
}): Promise<UpcomingEvent[] | null> {
  const auth = await getCalendarTokenOrNull();
  if (!auth) return null;
  const { token, calendarId } = auth;

  const params = new URLSearchParams({
    timeMin: opts.start,
    timeMax: opts.end,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(opts.maxResults ?? 50),
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Calendar API ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      htmlLink?: string;
      hangoutLink?: string;
      status?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      attendees?: Array<{ email?: string }>;
    }>;
  };

  return (data.items ?? [])
    .filter((event) => event.status !== "cancelled" && (event.start?.dateTime || event.start?.date))
    .map((event) => {
      const allDay = Boolean(event.start?.date && !event.start?.dateTime);
      return {
        id: event.id ?? "",
        // Empty, not a placeholder sentence: the page picks the "(untitled)"
        // wording in whatever language is active.
        summary: event.summary ?? "",
        start: (event.start?.dateTime ?? event.start?.date) as string,
        end: (event.end?.dateTime ?? event.end?.date) as string,
        allDay,
        link: event.htmlLink,
        meetLink: event.hangoutLink,
        attendees: (event.attendees ?? []).map((a) => a.email).filter((email): email is string => Boolean(email)),
      };
    });
}
