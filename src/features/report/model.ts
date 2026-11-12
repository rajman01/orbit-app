import { addDays, dayOf, daysBetween, type Day } from "@/lib/dates";
import type { SyncedDoc } from "@/lib/sync/entities";
import { habitConsistency, type Habit, type HabitLog } from "../habits/model";
import type { Task } from "../tasks/model";

type Ritual = SyncedDoc<"rituals">;
type TaskEvent = SyncedDoc<"taskEvents">;

export interface ScorePart {
  /** 0..1, or null when there was nothing to measure. */
  value: number | null;
  weight: number;
  label: string;
  detail: string;
}

export interface AccountabilityScore {
  /** 0–100, or null when nothing could be measured yet. */
  score: number | null;
  parts: { commitment: ScorePart; rituals: ScorePart; stale: ScorePart; habits: ScorePart };
}

export const SCORE_WINDOW_DAYS = 14;

/**
 * PRD §8.3: a rolling 14-day score (0–100) from commitments kept (40%), rituals done (25%),
 * stale tasks resolved (15%) and habit consistency (20%). Parts with nothing to measure are left
 * out and the rest are re-weighted, so a new user isn't scored on what they haven't started.
 */
export function accountabilityScore(opts: {
  today: Day;
  timezone: string;
  weekStart: number;
  /** The first day Orbit was used (the window never starts before it). */
  firstDay: Day;
  tasks: Task[];
  rituals: Pick<Ritual, "type" | "date" | "completedAt" | "data">[];
  taskEvents: Pick<TaskEvent, "reason" | "at">[];
  staleNow: number;
  habits: Habit[];
  habitLogs: HabitLog[];
}): AccountabilityScore {
  const from = maxDay(addDays(opts.today, -(SCORE_WINDOW_DAYS - 1)), opts.firstDay);
  const inWindow = (d: Day) => d >= from && d <= opts.today;
  const taskById = new Map(opts.tasks.map((t) => [t.id, t]));

  // Commitments: the Must-dos chosen in each day's plan, finished by the end of that day.
  let committed = 0;
  let kept = 0;
  for (const r of opts.rituals) {
    if (r.type !== "daily_plan" || !r.completedAt || !inWindow(r.date)) continue;
    const ids = Array.isArray(r.data.mustDos) ? (r.data.mustDos as string[]) : [];
    for (const id of ids) {
      const t = taskById.get(id);
      if (!t || t.status === "cancelled") continue;
      const ok = t.status === "done" && t.completedAt != null && dayOf(t.completedAt, opts.timezone) <= r.date;
      // Today isn't over: an open Must-do isn't a broken commitment yet.
      if (r.date === opts.today && !ok) continue;
      committed++;
      if (ok) kept++;
    }
  }

  // Rituals: a plan and a shutdown each day (today counts once it's done).
  const days = daysBetween(from, opts.today) + 1;
  const done = opts.rituals.filter(
    (r) => (r.type === "daily_plan" || r.type === "daily_shutdown") && r.completedAt && inWindow(r.date),
  );
  const todayDone = done.filter((r) => r.date === opts.today).length;
  const expected = 2 * (days - 1) + todayDone;

  // Stale tasks resolved in the window, against those still waiting.
  const resolved = opts.taskEvents.filter(
    (e) => e.reason?.startsWith("stale_") && inWindow(dayOf(e.at, opts.timezone)),
  ).length;

  const habits = habitConsistency(
    opts.habits.filter((h) => h.archivedAt == null),
    opts.habitLogs,
    from,
    opts.today,
    {
      weekStart: opts.weekStart,
      startDayOf: (h) => dayOf(opts.habits.find((x) => x.id === h.id)!.createdAt, opts.timezone),
    },
  );

  const parts = {
    commitment: {
      value: committed ? kept / committed : null,
      weight: 0.4,
      label: "Commitments kept",
      detail: committed ? `${kept} of ${committed} Must-dos done on their day` : "No Must-dos planned yet",
    },
    rituals: {
      value: expected ? Math.min(1, done.length / expected) : null,
      weight: 0.25,
      label: "Rituals done",
      detail: expected ? `${done.length} of ${expected} plans and shutdowns` : "No rituals due yet",
    },
    stale: {
      value: resolved + opts.staleNow ? resolved / (resolved + opts.staleNow) : null,
      weight: 0.15,
      label: "Stale tasks resolved",
      detail: resolved + opts.staleNow ? `${resolved} resolved, ${opts.staleNow} waiting` : "Nothing has gone stale",
    },
    habits: {
      value: habits,
      weight: 0.2,
      label: "Habit consistency",
      detail: habits == null ? "No habits due yet" : `${Math.round(habits * 100)}% of scheduled check-ins`,
    },
  };
  const measured = Object.values(parts).filter((p) => p.value != null);
  const weight = measured.reduce((s, p) => s + p.weight, 0);
  const score = weight ? Math.round((measured.reduce((s, p) => s + p.value! * p.weight, 0) / weight) * 100) : null;
  return { score, parts };
}

function maxDay(a: Day, b: Day): Day {
  return a > b ? a : b;
}

/** "Mirror, not judge" (§8.3): a word for the score. */
export function scoreWord(score: number): string {
  if (score >= 85) return "Locked in";
  if (score >= 70) return "Steady";
  if (score >= 50) return "Wobbling";
  return "Drifting";
}
