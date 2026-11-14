import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { addDays, dayOf, instantAt, minutesOfDay, type Day } from "@/lib/dates";

export type CalendarDoc = SyncedDoc<"calendars">;
export type CalendarEvent = SyncedDoc<"calendarEvents">;
export type EventFields = EntityFields<"calendarEvents">;
export type TimeBlock = SyncedDoc<"timeBlocks">;

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

// ---------------------------------------------------------------- time blocks (2B.2)

/** Default block length for a task's effort (points → minutes). */
export function blockMinutes(effort: number | null | undefined): number {
  return ({ 1: 30, 2: 60, 3: 90, 5: 120, 8: 180 } as Record<number, number>)[effort ?? 0] ?? 60;
}

/** Blocks snap to quarter hours. */
export const SNAP_MINUTES = 15;

/** The next quarter hour from now, as a day and minutes after midnight. */
export function nextSlot(now: number, timezone: string): { day: Day; minutes: number } {
  const day = dayOf(now, timezone);
  const m = Math.ceil(minutesOfDay(now, timezone) / SNAP_MINUTES) * SNAP_MINUTES;
  return m >= 24 * 60 ? { day: addDays(day, 1), minutes: 9 * 60 } : { day, minutes: m };
}

/** The instant `minutes` after local midnight on `day` (minutes may run past midnight). */
export function atMinutes(day: Day, minutes: number, timezone: string): number {
  const extraDays = Math.floor(minutes / 1440);
  const m = minutes - extraDays * 1440;
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return instantAt(addDays(day, extraDays), hhmm, timezone);
}

export interface Placed<T> {
  item: T;
  /** Minutes after local midnight, clipped to the day. */
  top: number;
  bottom: number;
  /** Side-by-side position when items overlap. */
  col: number;
  cols: number;
}

/**
 * Timed items on one day of a time grid: clipped to the day, and overlapping ones placed side by
 * side (each cluster of overlaps shares its column count).
 */
export function placeOnDay<T extends { start: number; end: number }>(
  items: T[],
  day: Day,
  timezone: string,
): Placed<T>[] {
  const dayStart = instantAt(day, "00:00", timezone);
  const dayEnd = instantAt(addDays(day, 1), "00:00", timezone);
  const placed = items
    .filter((i) => i.start < dayEnd && Math.max(i.end, i.start + 1) > dayStart)
    .map((item) => ({
      item,
      top: Math.max(0, Math.round((item.start - dayStart) / 60_000)),
      bottom: Math.min(Math.round((dayEnd - dayStart) / 60_000), Math.round((item.end - dayStart) / 60_000)),
      col: 0,
      cols: 1,
    }))
    .map((p) => ({ ...p, bottom: Math.max(p.bottom, p.top + SNAP_MINUTES) }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  let cluster: typeof placed = [];
  let clusterEnd = -1;
  const columnsEnd: number[] = [];
  const close = () => {
    for (const p of cluster) p.cols = columnsEnd.length;
    cluster = [];
    columnsEnd.length = 0;
  };
  for (const p of placed) {
    if (p.top >= clusterEnd) close();
    let col = columnsEnd.findIndex((end) => end <= p.top);
    if (col < 0) col = columnsEnd.push(0) - 1;
    columnsEnd[col] = p.bottom;
    p.col = col;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.bottom);
  }
  close();
  return placed;
}
