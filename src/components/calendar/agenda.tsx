"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { MapPin } from "lucide-react";
import { useSync } from "@/components/app/sync-provider";
import { SectionLabel } from "@/components/tasks/task-list";
import { agenda, type CalendarEvent } from "@/features/calendar/model";
import { useSettings } from "@/features/data";
import { useMinuteNow, useToday } from "@/features/use-today";
import { addDays, type Day } from "@/lib/dates";
import { cn } from "@/lib/cn";

export interface ShownEvent extends CalendarEvent {
  color: string;
  calendarName: string;
}

/** Events from the calendars you chose to show, overlapping [from, to) days (CAL-6). */
export function useCalendarEvents(from: Day, to: Day): ShownEvent[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const calendars = (await db.calendars.toArray()).filter((c) => c.deletedAt == null && c.selected);
    if (!calendars.length) return [];
    const byId = new Map(calendars.map((c) => [c.id, c]));
    // Generous instant range (a day either side) so every timezone is covered; onDay() decides.
    const lo = Date.parse(`${addDays(from, -1)}T00:00:00Z`);
    const hi = Date.parse(`${addDays(to, 1)}T00:00:00Z`);
    const rows = await db.calendarEvents.where("start").below(hi).toArray();
    return rows
      .filter((e) => e.deletedAt == null && e.end > lo && byId.has(e.calendarId))
      .map((e) => ({ ...e, color: byId.get(e.calendarId)!.color, calendarName: byId.get(e.calendarId)!.name }));
  }, [db, from, to]);
}

export const clock = (ms: number, timezone: string) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone });

export function timeRange(e: Pick<CalendarEvent, "start" | "end">, timezone: string) {
  const f = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: timezone });
  return `${f(e.start)} – ${f(e.end)}`;
}

/** Today's calendar on the Today page: all-day events, then the day in time order. */
export function TodayAgenda() {
  const todayDay = useToday();
  const { timezone } = useSettings();
  const now = useMinuteNow();
  const events = useCalendarEvents(todayDay, addDays(todayDay, 1));
  if (!events?.length) return null;
  const today = agenda(events, todayDay, timezone);
  if (!today.length) return null;
  return (
    <section aria-label="Calendar today" className="mb-4">
      <SectionLabel count={today.length}>Calendar</SectionLabel>
      <ul className="flex flex-col">
        {today.map((e) => {
          const past = !e.allDay && e.end <= now;
          const happening = !e.allDay && e.start <= now && now < e.end;
          return (
            <li key={e.id} className={cn("flex items-start gap-3 rounded-md px-2 py-1.5", past && "opacity-50")}>
              <span className="mt-1.5 h-4 w-1 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
              <span className="flex w-16 shrink-0 flex-col text-footnote leading-tight text-label-secondary tabular">
                {e.allDay ? (
                  "All day"
                ) : (
                  <>
                    <span className="text-label">{clock(e.start, timezone)}</span>
                    <span className="text-label-tertiary">{clock(e.end, timezone)}</span>
                  </>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-body", happening && "font-semibold")}>
                  {e.title}
                  {e.status === "tentative" ? <span className="text-label-tertiary"> (maybe)</span> : null}
                </span>
                {e.location ? (
                  <span className="flex items-center gap-1 truncate text-footnote text-label-tertiary">
                    <MapPin className="size-3 shrink-0" aria-hidden /> {e.location}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
