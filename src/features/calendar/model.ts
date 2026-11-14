import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { addDays, dayOf, type Day } from "@/lib/dates";

export type CalendarDoc = SyncedDoc<"calendars">;
export type CalendarEvent = SyncedDoc<"calendarEvents">;
export type EventFields = EntityFields<"calendarEvents">;

/** Events kept in Orbit: two weeks back, three months ahead (docs/phases/phase-2b.md, decision 5). */
export const WINDOW_BACK_DAYS = 14;
export const WINDOW_AHEAD_DAYS = 90;

interface ProviderEvent {
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

const utcMidnight = (d: Day) => Date.parse(`${d}T00:00:00Z`);

/**
 * A provider event as Orbit stores it, or null when it should be removed (cancelled, or with no
 * usable times). Timed events keep their instant; all-day events keep their days.
 */
export function eventFields(e: ProviderEvent, calendarId: string): EventFields | null {
  if (e.status === "cancelled" || !e.start || !e.end) return null;
  const base = {
    calendarId,
    title: (e.summary ?? "").trim().slice(0, 500) || "(No title)",
    location: e.location?.trim().slice(0, 500) || null,
    status: e.status === "tentative" ? ("tentative" as const) : ("confirmed" as const),
    link: e.htmlLink?.slice(0, 2000) ?? null,
  };
  if (e.start.date) {
    const startDay = e.start.date;
    const endDay = e.end.date && e.end.date > startDay ? e.end.date : addDays(startDay, 1);
    return { ...base, allDay: true, startDay, endDay, start: utcMidnight(startDay), end: utcMidnight(endDay) };
  }
  const start = Date.parse(e.start.dateTime ?? "");
  const end = Date.parse(e.end.dateTime ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { ...base, allDay: false, startDay: null, endDay: null, start, end: Math.max(end, start) };
}

/** Does the event fall on `day` in this timezone? (All-day events by their days.) */
export function onDay(
  e: Pick<CalendarEvent, "allDay" | "start" | "end" | "startDay" | "endDay">,
  day: Day,
  timezone: string,
) {
  if (e.allDay) return e.startDay! <= day && day < e.endDay!;
  const first = dayOf(e.start, timezone);
  // An event ending exactly at midnight doesn't count for the next day.
  const last = dayOf(Math.max(e.start, e.end - 1), timezone);
  return first <= day && day <= last;
}

/** Today's agenda: all-day first, then by start time. */
export function agenda<E extends Pick<CalendarEvent, "allDay" | "start" | "end" | "startDay" | "endDay" | "title">>(
  events: E[],
  day: Day,
  timezone: string,
): E[] {
  return events
    .filter((e) => onDay(e, day, timezone))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title));
}
