"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Calendar03Icon,
  Clock01Icon,
  ExternalLinkIcon,
  UserGroup02Icon,
  ArrowRight01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { GoogleMark } from "@/app/landing/_components/brand-marks";
import { PageContainer } from "../../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator } from "../../_components/dashboard-card";
import { KpiCard } from "../../_components/kpi-card";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson, isApiError, type UiError } from "@/lib/api-error-message";
import { fullTime, timeUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UpcomingEvent } from "@/lib/calendar";

// Calendar.
//
// A read-only window onto the Google Calendar the agent already books into —
// see the `calendar` tool's `book_event` action, and anyone booking straight
// in Google Calendar. Nothing here writes: booking stays the agent's job (or
// Google's own UI), this page is just "what's coming up" for the operator,
// drawn as a real month grid rather than a bare list.

type Locale = "es" | "en";

/** Spanish weeks read Monday-first; English ones read Sunday-first. */
const WEEK_START: Record<Locale, number> = { es: 1, en: 0 };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Local `YYYY-MM-DD`, not `toISOString().slice(0, 10)` — that one reads back
 *  in UTC and slides a late-evening event onto the wrong day for anyone west
 *  of Greenwich. */
function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** An all-day event's `start` is already a bare date with no time zone to
 *  misread; a timed one has to go through `Date` to land on the viewer's
 *  own calendar day. */
function eventDayKey(event: UpcomingEvent): string {
  return event.allDay ? event.start.slice(0, 10) : dayKey(new Date(event.start));
}

/** The 42 cells of a month grid: full weeks only, so the grid never grows or
 *  shrinks a row as someone pages between months. */
function buildMonthGrid(viewDate: Date, weekStart: number): Date[] {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const gridStart = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function weekdayLabels(weekStart: number, locale: Locale): string[] {
  // 2024-01-07 is a Sunday — a fixed anchor to read weekday names off of,
  // in whatever order this locale's grid wants them.
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) =>
    addDays(sunday, (weekStart + i) % 7).toLocaleDateString(locale, { weekday: "short" }),
  );
}

export default function CalendarPage() {
  const { t, locale } = useI18n();
  const weekStart = WEEK_START[locale];

  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [overview, setOverview] = useState<UpcomingEvent[] | null>(null);
  const [gridEvents, setGridEvents] = useState<UpcomingEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [gridLoading, setGridLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const gridDays = useMemo(() => buildMonthGrid(viewDate, weekStart), [viewDate, weekStart]);

  const fetchEvents = useCallback(
    (start: Date, end: Date) => {
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      return fetchJson<{ events?: UpcomingEvent[] }>(`/api/calendar/events?${params}`, t);
    },
    [t],
  );

  // A fixed 30-day window, independent of whatever month is on screen, so
  // the stat tiles keep answering "what's actually next" while someone pages
  // the grid off into some other month.
  const loadOverview = useCallback(async () => {
    const now = startOfDay(new Date());
    const result = await fetchEvents(now, addDays(now, 30));
    setLoading(false);
    if (!result.ok) {
      if (isApiError(result.error) && result.error.code === "not_configured") {
        setNotConfigured(true);
        setError(null);
      } else {
        setNotConfigured(false);
        setError(result.error);
      }
      return false;
    }
    setNotConfigured(false);
    setError(null);
    setOverview(result.data.events ?? []);
    return true;
  }, [fetchEvents]);

  const loadGrid = useCallback(async () => {
    setGridLoading(true);
    const result = await fetchEvents(gridDays[0], addDays(gridDays[41], 1));
    setGridLoading(false);
    if (!result.ok) {
      if (!(isApiError(result.error) && result.error.code === "not_configured")) setError(result.error);
      return;
    }
    setGridEvents(result.data.events ?? []);
  }, [fetchEvents, gridDays]);

  useEffect(() => {
    void (async () => {
      if (await loadOverview()) void loadGrid();
    })();
    // Only on mount: the grid effect below handles every later navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (overview === null) return; // still waiting on the first load above
    void loadGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, UpcomingEvent[]>();
    for (const event of gridEvents ?? []) {
      const key = eventDayKey(event);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [gridEvents]);

  const todayKey = dayKey(new Date());

  const stats = useMemo(() => {
    const events = overview ?? [];
    const now = new Date();
    const weekEnd = addDays(startOfDay(now), 7);
    const todayCount = events.filter((e) => eventDayKey(e) === todayKey).length;
    const weekCount = events.filter((e) => new Date(e.allDay ? `${e.start}T00:00:00` : e.start) < weekEnd).length;
    const next = events.find((e) => new Date(e.allDay ? `${e.start}T23:59:59` : e.start) >= now);
    return { todayCount, weekCount, next };
  }, [overview, todayKey]);

  const monthLabel = viewDate.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const labels = useMemo(() => weekdayLabels(weekStart, locale), [weekStart, locale]);

  const dayList = selectedDay
    ? (eventsByDay.get(selectedDay) ?? [])
    : Array.from(eventsByDay.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .flatMap(([, events]) => events);

  const emptyState = !loading && !notConfigured && !error && (overview ?? []).length === 0;

  return (
    <PageContainer maxWidth="max-w-[1400px]" pattern="grid">
      <Skeleton className="min-h-[500px]" isLoading={loading} skeleton={<CalendarSkeleton />}>
        <div className="content-enter">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold">{t("calendar.title")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("calendar.subtitle")}</p>
          </header>

          {error ? (
            <ErrorBanner
              className="mb-6"
              error={error}
              onRetry={() => void loadOverview().then((ok) => { if (ok) void loadGrid(); })}
              onDismiss={() => setError(null)}
            />
          ) : null}

          {notConfigured ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <GoogleMark size={20} />
                </div>
                <p className="text-sm font-medium">{t("calendar.notConnectedTitle")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("calendar.notConnectedDescription")}</p>
                <Button asChild size="sm" className="mt-1">
                  <Link href="/connections">
                    {t("calendar.goToConnections")}
                    <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.75} />
                  </Link>
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {/* Stat tiles — always "as of right now", whatever month the
                  grid below happens to be showing. */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  icon={Calendar03Icon}
                  label={t("calendar.today")}
                  value={stats.todayCount}
                  sub={stats.todayCount > 0 ? t("calendar.todaySub") : t("calendar.todaySubNone")}
                />
                <KpiCard
                  icon={Clock01Icon}
                  label={t("calendar.thisWeek")}
                  value={stats.weekCount}
                  sub={stats.weekCount > 0 ? t("calendar.thisWeekSub") : t("calendar.thisWeekSubNone")}
                />
                <KpiCard
                  icon={ArrowRight01Icon}
                  label={t("calendar.nextEvent")}
                  value={stats.next ? timeUntil(stats.next.start, locale) : "—"}
                  sub={stats.next ? stats.next.summary || t("calendar.untitled") : t("calendar.nextEventNone")}
                />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
                <Card>
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <p className="text-sm font-medium capitalize">{monthLabel}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedDay(null);
                          setViewDate(startOfDay(new Date()));
                        }}
                      >
                        {t("calendar.today")}
                      </Button>
                      <button
                        type="button"
                        aria-label={t("calendar.prevMonth")}
                        onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("calendar.nextMonth")}
                        onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                  <CardSeparator />
                  <div className={cn("p-3", gridLoading && "opacity-60")}>
                    <div className="grid grid-cols-7 gap-1 px-2 pb-1">
                      {labels.map((label, i) => (
                        <div key={i} className="text-center text-[11px] font-medium text-muted-foreground/70 uppercase">
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {gridDays.map((date) => {
                        const key = dayKey(date);
                        const inMonth = date.getMonth() === viewDate.getMonth();
                        const isToday = key === todayKey;
                        const isSelected = key === selectedDay;
                        const dayEvents = eventsByDay.get(key) ?? [];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedDay(isSelected ? null : key)}
                            className={cn(
                              "flex aspect-square flex-col items-center justify-start gap-1 rounded-lg px-1 py-1.5 text-xs transition-colors",
                              inMonth ? "text-foreground" : "text-muted-foreground/40",
                              isSelected ? "bg-accent" : "hover:bg-accent/50",
                              isToday && !isSelected && "bg-primary/8",
                            )}
                          >
                            <span className={cn("tabular-nums", isToday && "font-semibold")}>{date.getDate()}</span>
                            {dayEvents.length > 0 ? (
                              <span className="flex items-center gap-0.5">
                                {dayEvents.slice(0, 3).map((_, i) => (
                                  <span key={i} className="size-1 rounded-full bg-foreground/60" />
                                ))}
                                {dayEvents.length > 3 ? (
                                  <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3}</span>
                                ) : null}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                <section className="lg:sticky lg:top-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {selectedDay
                        ? new Date(`${selectedDay}T00:00:00`).toLocaleDateString(locale, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })
                        : t("calendar.upcomingInView")}
                    </h2>
                    {selectedDay ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(null)}
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t("calendar.clearSelection")}
                      </button>
                    ) : null}
                  </div>
                  {emptyState && dayList.length === 0 ? (
                    <Card>
                      <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                          <HugeiconsIcon icon={Calendar03Icon} size={20} strokeWidth={1.75} />
                        </div>
                        <p className="text-sm font-medium">{t("calendar.emptyTitle")}</p>
                        <p className="max-w-xs text-xs text-muted-foreground">{t("calendar.emptyDescription")}</p>
                      </div>
                    </Card>
                  ) : dayList.length === 0 ? (
                    <p className="px-1 text-sm text-muted-foreground">{t("calendar.noEventsThatDay")}</p>
                  ) : (
                    <div className="max-h-[calc(100vh-320px)] space-y-3 overflow-y-auto pr-0.5">
                      {dayList.map((event) => (
                        <EventRow key={event.id || `${eventDayKey(event)}-${event.start}`} event={event} t={t} locale={locale} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </Skeleton>
    </PageContainer>
  );
}

function EventRow({
  event,
  locale,
  t,
}: {
  readonly event: UpcomingEvent;
  readonly locale: Locale;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{event.summary || t("calendar.untitled")}</CardTitle>
          <CardDescription>{event.allDay ? t("calendar.allDay") : fullTime(event.start, locale)}</CardDescription>
        </div>
        {event.link ? (
          <a
            href={event.link}
            target="_blank"
            rel="noreferrer noopener"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            aria-label={t("calendar.openInGoogle")}
          >
            <HugeiconsIcon icon={ExternalLinkIcon} size={15} strokeWidth={1.75} />
          </a>
        ) : null}
      </CardHeader>

      {!event.allDay || event.attendees.length > 0 || event.meetLink ? (
        <>
          <CardSeparator />
          <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-xs text-muted-foreground">
            {!event.allDay ? (
              <span className="inline-flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.75} />
                {timeUntil(event.start, locale)}
              </span>
            ) : null}
            {event.meetLink ? (
              <a
                href={event.meetLink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:underline"
              >
                <HugeiconsIcon icon={Video01Icon} size={14} strokeWidth={1.75} />
                {t("calendar.joinMeet")}
              </a>
            ) : null}
            {event.attendees.length > 0 ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <HugeiconsIcon icon={UserGroup02Icon} size={14} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{event.attendees.join(", ")}</span>
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}

function CalendarSkeleton() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <SkeletonBar className="h-7 w-40" />
        <SkeletonBar className="h-4 w-96 max-w-full" />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <SkeletonBar className="h-7 w-12" />
            <SkeletonBar className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      {/* Two-column: month grid + upcoming sidebar, matching the real layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between px-2 pb-3">
            <SkeletonBar className="h-4 w-32" />
            <div className="flex gap-1">
              <SkeletonBar className="size-8 rounded-lg" />
              <SkeletonBar className="size-8 rounded-lg" />
              <SkeletonBar className="size-8 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <SkeletonBar key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <SkeletonBar className="h-4 w-32" />
          {[0, 1].map((i) => (
            <Card key={i}>
              <div className="flex items-center gap-3 px-5 py-5">
                <SkeletonBar className="size-9 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBar className="h-3.5" width="65%" />
                  <SkeletonBar className="h-3" width="40%" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
