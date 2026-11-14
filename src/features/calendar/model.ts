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

// ---------------------------------------------------------------- free time (2B.4, CAL-5)

export interface Span {
  start: number;
  end: number;
}

/** Shorter gaps than this aren't worth calling free time. */
export const MIN_FREE_MINUTES = 15;

/**
 * Free time on `day` within working hours around the busy spans, from `notBefore` on (now, for
 * today). Gaps shorter than MIN_FREE_MINUTES are left out.
 */
export function freeSlots(
  day: Day,
  timezone: string,
  workingHours: { start: string; end: string },
  busy: Span[],
  notBefore = -Infinity,
): Span[] {
  let from = instantAt(day, workingHours.start, timezone);
  const until = instantAt(day, workingHours.end, timezone);
  from = Math.max(from, Math.ceil(notBefore / 300_000) * 300_000); // from the next 5 minutes
  if (until <= from) return [];
  const sorted = busy.filter((b) => b.end > from && b.start < until).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let cursor = from;
  for (const b of sorted) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, until) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= until) break;
  }
  if (cursor < until) out.push({ start: cursor, end: until });
  return out.filter((s) => s.end - s.start >= MIN_FREE_MINUTES * 60_000);
}

export const spanMinutes = (spans: Span[]) => Math.round(spans.reduce((n, s) => n + (s.end - s.start), 0) / 60_000);

/** The first slot with room for `minutes`, starting on a quarter hour. */
export function firstFit(slots: Span[], minutes: number): Span | null {
  for (const s of slots) {
    const start = Math.ceil(s.start / (SNAP_MINUTES * 60_000)) * SNAP_MINUTES * 60_000;
    if (start + minutes * 60_000 <= s.end) return { start, end: start + minutes * 60_000 };
  }
  return null;
}

/** "3h 15m", "45m", "2h". */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

export interface DayFit {
  /** Free time in working hours (time blocked for the Must-dos counts as free: it's theirs). */
  slots: Span[];
  free: number;
  /** What today's open Must-dos need, from their effort. */
  need: number;
  fits: boolean;
}

/**
 * CAL-5: do the day's Must-dos fit in the free time? Busy is calendar events (timed) and time
 * blocks for anything other than the Must-dos.
 */
export function dayFit(o: {
  day: Day;
  timezone: string;
  workingHours: { start: string; end: string };
  events: Pick<CalendarEvent, "start" | "end" | "allDay">[];
  blocks: Pick<TimeBlock, "start" | "end" | "taskId">[];
  mustDos: { id: string; effort: number | null }[];
  now: number;
}): DayFit {
  const ids = new Set(o.mustDos.map((t) => t.id));
  const busy = [...o.events.filter((e) => !e.allDay), ...o.blocks.filter((b) => !b.taskId || !ids.has(b.taskId))];
  const notBefore = dayOf(o.now, o.timezone) === o.day ? o.now : -Infinity;
  const slots = freeSlots(o.day, o.timezone, o.workingHours, busy, notBefore);
  const free = spanMinutes(slots);
  const need = o.mustDos.reduce((n, t) => n + blockMinutes(t.effort), 0);
  return { slots, free, need, fits: need <= free };
}
