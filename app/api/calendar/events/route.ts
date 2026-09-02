import { NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { listUpcomingEvents } from "@/lib/calendar";

// GET /api/calendar/events?start=<ISO>&end=<ISO> — what the Calendar page
// draws for the month grid it currently has open. Both params are optional;
// without them this defaults to "next 30 days", the same window a caller
// hitting this route directly (curl, a script) would expect from its name.

const DEFAULT_WINDOW_DAYS = 30;
const MAX_RESULTS = 250;

export const GET = withApiErrors(async function GET(request: Request) {
  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");

  const now = new Date();
  const start = startParam && !Number.isNaN(Date.parse(startParam)) ? new Date(startParam) : now;
  const end =
    endParam && !Number.isNaN(Date.parse(endParam))
      ? new Date(endParam)
      : new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const events = await listUpcomingEvents({
    start: start.toISOString(),
    end: end.toISOString(),
    maxResults: MAX_RESULTS,
  });

  // No Google identity configured at all — a state of the install, not a
  // failed request, so the page gets its "connect Google" panel instead of
  // an error banner. See lib/api-error.ts's `not_configured`.
  if (events === null) {
    return apiError("not_configured");
  }

  return NextResponse.json({ events });
});
