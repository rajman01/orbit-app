"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock } from "lucide-react";
import { useSync } from "@/components/app/sync-provider";
import { useActions } from "@/features/actions";
import {
  blockMinutes,
  dayFit,
  firstFit,
  formatMinutes,
  freeSlots,
  onDay,
  type DayFit,
} from "@/features/calendar/model";
import { useAllTasks, useSettings } from "@/features/data";
import { isOpen, type Task } from "@/features/tasks/model";
import { useMinuteNow } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayOf, type Day } from "@/lib/dates";
import { clock, useCalendarEvents, useTimeBlocks } from "./agenda";

/** Free time and whether the Must-dos fit, for a day (CAL-5). */
export function useDayFit(day: Day) {
  const { db } = useSync();
  const { timezone, workingHours } = useSettings();
  const now = useMinuteNow();
  const events = useCalendarEvents(day, addDays(day, 1));
  const blocks = useTimeBlocks(day, addDays(day, 1));
  const tasks = useAllTasks();
  const hasCalendar = useLiveQuery(
    async () => (await db.calendars.toArray()).some((c) => c.deletedAt == null && c.selected && !c.isOrbit),
    [db],
  );
  if (!events || !blocks || !tasks) return null;
  const dayEvents = events.filter((e) => onDay(e, day, timezone));
  const dayBlocks = blocks.filter((b) => dayOf(b.start, timezone) === day);
  const mustDos = tasks.filter((t) => t.mustDoDate === day && isOpen(t) && t.deletedAt == null);
  const fit = dayFit({ day, timezone, workingHours, events: dayEvents, blocks: dayBlocks, mustDos, now });
  return { fit, mustDos, events: dayEvents, blocks: dayBlocks, hasCalendar: hasCalendar ?? false, now };
}

/** "3h 15m free in working hours", or a warning when the Must-dos need more than that. */
export function FreeTimeNote({ fit, className }: { fit: DayFit; className?: string }) {
  const over = !fit.fits;
  return (
    <p
      role={over ? "alert" : undefined}
      aria-label="Free time"
      className={cn(
        "flex items-start gap-1.5 text-footnote",
        over ? "text-warning-text" : "text-label-secondary",
        className,
      )}
    >
      <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {over ? (
          <>
            Your Must-dos need about <strong>{formatMinutes(fit.need)}</strong>, but you have{" "}
            <strong>{formatMinutes(fit.free)}</strong> free in working hours. Move one or make it smaller.
          </>
        ) : (
          <>
            <strong className="text-label">{formatMinutes(fit.free)}</strong> free in working hours
            {fit.need ? ` · Must-dos need about ${formatMinutes(fit.need)}` : ""}
          </>
        )}
      </span>
    </p>
  );
}

/** Today page: shown once a calendar is connected (otherwise working hours are all "free"). */
export function TodayFreeTime({ day }: { day: Day }) {
  const data = useDayFit(day);
  if (!data || (!data.hasCalendar && !data.blocks.length)) return null;
  if (!data.fit.free && !data.fit.need) return null;
  return <FreeTimeNote fit={data.fit} className="mb-4" />;
}

/**
 * Daily Plan: block a Must-do into the first free slot that fits (or say when it's already
 * blocked). Other blocks and events count as busy here, so Must-dos don't land on each other.
 */
export function BlockMustDo({ task, day }: { task: Task; day: Day }) {
  const actions = useActions();
  const { timezone, workingHours } = useSettings();
  const data = useDayFit(day);
  if (!data) return null;
  const own = data.blocks.filter((b) => b.taskId === task.id);
  if (own.length) {
    return (
      <span className="text-footnote text-label-secondary tabular">
        Blocked {clock(own[0].start, timezone)}–{clock(own[0].end, timezone)}
      </span>
    );
  }
  const minutes = blockMinutes(task.effort);
  const notBefore = dayOf(data.now, timezone) === day ? data.now : -Infinity;
  const slot = firstFit(
    freeSlots(day, timezone, workingHours, [...data.events.filter((e) => !e.allDay), ...data.blocks], notBefore),
    minutes,
  );
  if (!slot) return <span className="text-footnote text-label-tertiary">No free slot of {formatMinutes(minutes)}</span>;
  return (
    <button
      type="button"
      onClick={() => void actions.blockTime({ taskId: task.id, title: task.title, start: slot.start, end: slot.end })}
      className="text-footnote font-semibold text-accent-text hover:underline"
      aria-label={`Block ${clock(slot.start, timezone)} to ${clock(slot.end, timezone)} for ${task.title}`}
    >
      Block {clock(slot.start, timezone)}–{clock(slot.end, timezone)}
    </button>
  );
}
