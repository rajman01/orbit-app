import { addDays, dayOf, daysBetween, weekday, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { isOpen, type Task } from "../tasks/model";

export type Cycle = SyncedDoc<"cycles">;
export type CycleFields = EntityFields<"cycles">;
export type Ritual = SyncedDoc<"rituals">;
export type RitualType = Ritual["type"];
export type Strictness = "gentle" | "firm" | "strict";

// ---------------------------------------------------------------- ids

/**
 * Cycles are generated on each device (works offline), so ids are deterministic: two devices
 * that create cycle 4 create the same document. The number comes first so a long user id can
 * only ever lose its tail to the 40-character limit, never the number.
 */
export function cycleId(userId: string, number: number): string {
  return `c${String(number).padStart(5, "0")}${userId}`.slice(0, 40);
}

const RITUAL_CODE: Record<RitualType, string> = { daily_plan: "p", daily_shutdown: "s", cycle_review: "r" };

/** One ritual of each type per day, the same on every device. */
export function ritualId(userId: string, type: RitualType, date: Day): string {
  return `r${RITUAL_CODE[type]}${date.replaceAll("-", "")}${userId}`.slice(0, 40);
}

// ---------------------------------------------------------------- dates

/** The most recent `weekStart` (0 = Sunday) on or before `day`. */
export function startOfWeek(day: Day, weekStart: number): Day {
  return addDays(day, -((weekday(day) - weekStart + 7) % 7));
}

export interface CycleDates {
  number: number;
  startDate: Day;
  endDate: Day;
}

/** The first cycle starts on the week-start day on or before today (PRD CYC-1). */
export function firstCycle(today: Day, weekStart: number, length: number): CycleDates {
  const startDate = startOfWeek(today, weekStart);
  return { number: 1, startDate, endDate: addDays(startDate, length - 1) };
}

/**
 * The cycle after `last`, with the current length setting (a change applies from the next cycle,
 * never mid-cycle). If Orbit wasn't opened for a while, empty periods are skipped so the new
 * cycle is the one containing `today`; numbering carries on without gaps.
 */
export function nextCycle(last: CycleDates, length: number, today?: Day): CycleDates {
  let startDate = addDays(last.endDate, 1);
  if (today && addDays(startDate, length - 1) < today) {
    startDate = addDays(startDate, Math.floor(daysBetween(startDate, today) / length) * length);
  }
  return { number: last.number + 1, startDate, endDate: addDays(startDate, length - 1) };
}

/** Dates to create so there is a cycle containing today and the one after it (for planning ahead). */
export function cyclesToCreate(existing: CycleDates[], today: Day, weekStart: number, length: number): CycleDates[] {
  const sorted = [...existing].sort((a, b) => a.number - b.number);
  const out: CycleDates[] = [];
  let last = sorted[sorted.length - 1];
  if (!last) {
    last = firstCycle(today, weekStart, length);
    out.push(last);
  }
  while (last.endDate < today) {
    last = nextCycle(last, length, today);
    out.push(last);
  }
  // Keep exactly one cycle ahead of the current one.
  const current = [...sorted, ...out].find((c) => c.startDate <= today && today <= c.endDate) ?? last;
  if (![...sorted, ...out].some((c) => c.number === current.number + 1)) out.push(nextCycle(current, length));
  return out;
}

export type CycleState = "upcoming" | "active" | "review" | "done";

/** Active until its last day; on the last day and after, it waits for its review. */
export function cycleState(c: Pick<Cycle, "startDate" | "endDate" | "reviewCompletedAt">, today: Day): CycleState {
  if (c.reviewCompletedAt) return "done";
  if (today < c.startDate) return "upcoming";
  if (today < c.endDate) return "active";
  return "review";
}

export function currentCycle<C extends Pick<Cycle, "startDate" | "endDate">>(cycles: C[], today: Day): C | undefined {
  return cycles.find((c) => c.startDate <= today && today <= c.endDate);
}

/** Days left including today (0 once it has ended). */
export function daysLeft(c: Pick<Cycle, "endDate">, today: Day): number {
  return Math.max(0, daysBetween(today, c.endDate) + 1);
}

/** Day n of the cycle (1-based). */
export function dayOfCycle(c: Pick<Cycle, "startDate">, today: Day): number {
  return daysBetween(c.startDate, today) + 1;
}

// ---------------------------------------------------------------- planning

/**
 * The cycle you plan into: the current one until it's committed, then the next one.
 * Planning a cycle that has already started is allowed (the first cycle always has).
 */
export function planningTarget<C extends Pick<Cycle, "number" | "startDate" | "endDate" | "committedAt">>(
  cycles: C[],
  today: Day,
): C | undefined {
  const current = currentCycle(cycles, today);
  if (current && !current.committedAt) return current;
  const after = current?.number ?? 0;
  return cycles.filter((c) => c.number > after).sort((a, b) => a.number - b.number)[0];
}

export type PlanningGate = { blocked: false } | { blocked: true; canOverride: boolean; cycle: Pick<Cycle, "number"> };

/**
 * §8.1 / §8.5: a missed cycle review blocks planning the next cycle. Firm allows an override with
 * a reason; Strict doesn't; Gentle never blocks.
 */
export function planningGate(
  cycles: Pick<Cycle, "number" | "startDate" | "endDate" | "reviewCompletedAt" | "planningOverride">[],
  target: Pick<Cycle, "number" | "planningOverride"> | undefined,
  today: Day,
  strictness: Strictness,
): PlanningGate {
  if (!target || strictness === "gentle") return { blocked: false };
  const previous = cycles.find((c) => c.number === target.number - 1);
  if (!previous || previous.reviewCompletedAt || previous.endDate > today) return { blocked: false };
  // The last day itself is review day: planning the next cycle is part of the review.
  if (previous.endDate === today) return { blocked: false };
  if (target.planningOverride && strictness === "firm") return { blocked: false };
  return { blocked: true, canOverride: strictness === "firm", cycle: previous };
}

export interface CyclePoints {
  committed: number;
  added: number;
  done: number;
  total: number;
  tasks: number;
  doneTasks: number;
}

/** Points in a cycle: committed at planning time, added since, and done (PRD CYC-3). */
export function cyclePoints(
  tasks: Task[],
  cycle: Pick<Cycle, "id" | "committedTaskIds" | "committedPts">,
): CyclePoints {
  const inCycle = tasks.filter((t) => t.cycleId === cycle.id && !t.parentTaskId && t.status !== "cancelled");
  const committedIds = new Set(cycle.committedTaskIds);
  const pts = (t: Task) => t.effort ?? 0;
  const added = inCycle.filter((t) => !committedIds.has(t.id)).reduce((s, t) => s + pts(t), 0);
  const done = inCycle.filter((t) => t.status === "done").reduce((s, t) => s + pts(t), 0);
  return {
    committed: cycle.committedPts,
    added,
    done,
    total: cycle.committedPts + added,
    tasks: inCycle.length,
    doneTasks: inCycle.filter((t) => t.status === "done").length,
  };
}

export interface BurnUpPoint {
  day: Day;
  scope: number;
  done: number | null;
}

/**
 * Burn-up (PRD CYC-3): for each day, the scope (committed points plus points added by then)
 * and the points done by the end of that day. Future days have no "done" value.
 */
export function burnUp(
  tasks: Task[],
  cycle: Pick<Cycle, "id" | "startDate" | "endDate" | "committedTaskIds" | "committedPts">,
  addedAt: Map<string, number>,
  today: Day,
  timezone: string,
): BurnUpPoint[] {
  const inCycle = tasks.filter((t) => t.cycleId === cycle.id && !t.parentTaskId && t.status !== "cancelled");
  const committedIds = new Set(cycle.committedTaskIds);
  const days = daysBetween(cycle.startDate, cycle.endDate) + 1;
  const out: BurnUpPoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(cycle.startDate, i);
    const added = inCycle
      .filter((t) => !committedIds.has(t.id))
      .filter((t) => dayOf(addedAt.get(t.id) ?? t.createdAt, timezone) <= day)
      .reduce((s, t) => s + (t.effort ?? 0), 0);
    const done =
      day > today
        ? null
        : inCycle
            .filter((t) => t.status === "done" && t.completedAt != null && dayOf(t.completedAt, timezone) <= day)
            .reduce((s, t) => s + (t.effort ?? 0), 0);
    out.push({ day, scope: cycle.committedPts + added, done });
  }
  return out;
}

/** Open tasks of a cycle that still need a rollover decision at review time (PRD CYC-4). */
export function unfinishedInCycle(tasks: Task[], cycleIdValue: string): Task[] {
  return tasks.filter((t) => t.cycleId === cycleIdValue && !t.parentTaskId && isOpen(t) && t.deletedAt == null);
}

/** Tasks that can be pulled into a cycle: open, top-level, not already in it. */
export function planningCandidates(tasks: Task[], cycleIdValue: string): Task[] {
  return tasks.filter(
    (t) => !t.parentTaskId && t.deletedAt == null && isOpen(t) && t.cycleId !== cycleIdValue && t.status !== "inbox",
  );
}

// ---------------------------------------------------------------- rituals

/** The local time of day in a timezone, as "HH:MM". */
export function timeOfDay(now: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
}

export interface DueRitual {
  type: RitualType;
  date: Day;
  /** Carried over from an earlier day (§8.1). */
  missed?: boolean;
}

/**
 * Which rituals are waiting (RIT-4: pinned at the top of Today until done):
 * - Daily Plan from the start of the day until it's done.
 * - Daily Shutdown from the shutdown time until it's done.
 * - Cycle Review from the review time on the cycle's last day, and every day after until done.
 */
export function dueRituals(opts: {
  rituals: Pick<Ritual, "type" | "date" | "completedAt">[];
  cycles: Pick<Cycle, "id" | "number" | "startDate" | "endDate" | "reviewCompletedAt">[];
  today: Day;
  time: string;
  times: { plan: string; shutdown: string; review: string };
}): DueRitual[] {
  const done = (type: RitualType, date: Day) =>
    opts.rituals.some((r) => r.type === type && r.date === date && r.completedAt != null);
  const due: DueRitual[] = [];
  const review = opts.cycles
    .filter(
      (c) =>
        !c.reviewCompletedAt &&
        (c.endDate < opts.today || (c.endDate === opts.today && opts.time >= opts.times.review)),
    )
    .sort((a, b) => a.number - b.number)[0];
  if (review) due.push({ type: "cycle_review", date: review.endDate, missed: review.endDate < opts.today });
  if (!done("daily_plan", opts.today)) due.push({ type: "daily_plan", date: opts.today });
  if (opts.time >= opts.times.shutdown && !done("daily_shutdown", opts.today)) {
    due.push({ type: "daily_shutdown", date: opts.today });
  }
  return due;
}

/** Yesterday's shutdown was skipped: the morning plan picks it up (§8.1). */
export function missedShutdown(rituals: Pick<Ritual, "type" | "date" | "completedAt">[], today: Day): boolean {
  const yesterday = addDays(today, -1);
  const hadPlan = rituals.some((r) => r.type === "daily_plan" && r.date === yesterday);
  const shutdown = rituals.some((r) => r.type === "daily_shutdown" && r.date === yesterday && r.completedAt != null);
  return hadPlan && !shutdown;
}

/**
 * Consecutive days with this ritual completed (RIT-5), ending today — or yesterday, so the
 * streak isn't shown as broken before today's has had a chance to happen.
 */
export function ritualStreak(
  rituals: Pick<Ritual, "type" | "date" | "completedAt">[],
  type: RitualType,
  today: Day,
): number {
  const days = new Set(rituals.filter((r) => r.type === type && r.completedAt != null).map((r) => r.date));
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export const RITUAL_META: Record<RitualType, { title: string; blurb: string; minutes: number }> = {
  daily_plan: { title: "Plan your day", blurb: "Clear yesterday, pick your Must-dos, set first steps.", minutes: 5 },
  daily_shutdown: { title: "Shut down the day", blurb: "Close out today and see tomorrow.", minutes: 3 },
  cycle_review: {
    title: "Review the cycle",
    blurb: "Decide what's unfinished, reflect, plan the next one.",
    minutes: 20,
  },
};
