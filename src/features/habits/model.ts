import { addDays, daysBetween, weekday, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";

export type Habit = SyncedDoc<"habits">;
export type HabitFields = EntityFields<"habits">;
export type HabitLog = SyncedDoc<"habitLogs">;
export type Schedule = HabitFields["schedule"];

/** One log per habit per day, the same id on every device. */
export function habitLogId(habitId: string, date: Day): string {
  return `h${date.replaceAll("-", "")}${habitId}`.slice(0, 40);
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleLabel(s: Schedule): string {
  if (s.type === "daily") return "Every day";
  if (s.type === "weekly") return s.timesPerWeek === 7 ? "Every day" : `${s.timesPerWeek}× a week`;
  const days = [...s.days].sort();
  if (days.length === 7) return "Every day";
  if (days.join() === "1,2,3,4,5") return "Weekdays";
  if (days.join() === "0,6") return "Weekends";
  return days.map((d) => WD[d]).join(", ");
}

export function targetLabel(h: Pick<Habit, "targetType" | "targetCount" | "unit">): string | null {
  return h.targetType === "count" ? `${h.targetCount}${h.unit ? ` ${h.unit}` : ""}` : null;
}

/** Is the habit done on that day (value reaches the target)? */
export function doneOn(
  h: Pick<Habit, "targetType" | "targetCount">,
  log: Pick<HabitLog, "value"> | undefined,
): boolean {
  if (!log) return false;
  return h.targetType === "boolean" ? log.value >= 1 : log.value >= h.targetCount;
}

/** Days on a fixed schedule; weekly habits are scheduled by the week, not the day. */
function scheduledOn(s: Schedule, day: Day): boolean {
  if (s.type === "daily") return true;
  if (s.type === "days") return s.days.includes(weekday(day));
  return false;
}

/** The week containing `day`, starting on the user's week-start day. */
export function weekStartOf(day: Day, weekStart: number): Day {
  return addDays(day, -((weekday(day) - weekStart + 7) % 7));
}

export interface HabitStatus {
  /** Should it be done today (and isn't yet)? */
  due: boolean;
  doneToday: boolean;
  /** Days in a row (or weeks, for "× a week" habits), with one miss allowed between them. */
  streak: number;
  unit: "day" | "week";
  /** The last scheduled period was missed: one more miss breaks the streak ("never miss twice"). */
  atRisk: boolean;
  /** For weekly habits: done so far this week. */
  thisWeek?: { done: number; target: number };
}

/**
 * PRD HAB-3, "never miss twice": a single missed day keeps the streak alive but at risk; two
 * misses in a row break it. Today never counts as a miss, since there's still time.
 */
export function habitStatus(
  h: Pick<Habit, "schedule" | "targetType" | "targetCount" | "createdAt">,
  logs: Pick<HabitLog, "date" | "value">[],
  today: Day,
  opts: { weekStart: number; startDay: Day },
): HabitStatus {
  const byDay = new Map(logs.map((l) => [l.date, l]));
  const isDone = (d: Day) => doneOn(h, byDay.get(d));
  const doneToday = isDone(today);

  if (h.schedule.type === "weekly") {
    const target = h.schedule.timesPerWeek;
    const week = weekStartOf(today, opts.weekStart);
    const countIn = (start: Day) => {
      let n = 0;
      for (let i = 0; i < 7; i++) if (isDone(addDays(start, i))) n++;
      return n;
    };
    const current = countIn(week);
    let streak = current >= target ? 1 : 0;
    let atRisk = false;
    let missesInRow = 0;
    for (let w = addDays(week, -7); w >= weekStartOf(opts.startDay, opts.weekStart); w = addDays(w, -7)) {
      if (countIn(w) >= target) {
        streak++;
        missesInRow = 0;
      } else {
        missesInRow++;
        if (w === addDays(week, -7)) atRisk = true;
        if (missesInRow >= 2) break;
      }
    }
    if (streak === 0) atRisk = false;
    return {
      due: !doneToday && current < target,
      doneToday,
      streak,
      unit: "week",
      atRisk: atRisk && current < target,
      thisWeek: { done: current, target },
    };
  }

  const scheduledToday = scheduledOn(h.schedule, today);
  let streak = doneToday ? 1 : 0;
  let atRisk = false;
  let missesInRow = 0;
  let firstChecked = true;
  for (let d = addDays(today, -1); d >= opts.startDay && daysBetween(d, today) <= 3660; d = addDays(d, -1)) {
    if (!scheduledOn(h.schedule, d)) continue;
    if (isDone(d)) {
      streak++;
      missesInRow = 0;
    } else {
      missesInRow++;
      if (firstChecked) atRisk = true;
      if (missesInRow >= 2) break;
    }
    firstChecked = false;
  }
  if (streak === 0) atRisk = false;
  return { due: scheduledToday && !doneToday, doneToday, streak, unit: "day", atRisk: atRisk && !doneToday };
}

/**
 * Habit consistency for the accountability score (§8.3): scheduled days done out of scheduled
 * days in the window (weekly habits: done out of the target, per week). Null if nothing was due.
 */
export function habitConsistency(
  habits: Pick<Habit, "id" | "schedule" | "targetType" | "targetCount" | "createdAt" | "archivedAt">[],
  logs: Pick<HabitLog, "habitId" | "date" | "value">[],
  from: Day,
  to: Day,
  opts: { weekStart: number; startDayOf: (h: { id: string }) => Day },
): number | null {
  let due = 0;
  let done = 0;
  for (const h of habits) {
    const own = logs.filter((l) => l.habitId === h.id);
    const byDay = new Map(own.map((l) => [l.date, l]));
    const start = opts.startDayOf(h) > from ? opts.startDayOf(h) : from;
    if (h.schedule.type === "weekly") {
      const target = h.schedule.timesPerWeek;
      for (let w = weekStartOf(start, opts.weekStart); w <= to; w = addDays(w, 7)) {
        let n = 0;
        for (let i = 0; i < 7; i++) {
          const d = addDays(w, i);
          if (d >= start && d <= to && doneOn(h, byDay.get(d))) n++;
        }
        due += target;
        done += Math.min(n, target);
      }
      continue;
    }
    // Today isn't over yet: it only counts once it's done.
    for (let d = start; d <= to; d = addDays(d, 1)) {
      if (!scheduledOn(h.schedule, d)) continue;
      const ok = doneOn(h, byDay.get(d));
      if (d === to && !ok) continue;
      due++;
      if (ok) done++;
    }
  }
  return due ? done / due : null;
}

export function newHabitFields(partial: Partial<HabitFields> & { name: string }): HabitFields {
  return {
    areaId: null,
    goalId: null,
    schedule: { type: "daily" },
    targetType: "boolean",
    targetCount: 1,
    unit: null,
    reminderTime: null,
    archivedAt: null,
    order: Date.now(),
    ...partial,
  };
}
