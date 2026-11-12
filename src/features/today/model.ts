import { addDays, dayOf, daysBetween, type Day } from "@/lib/dates";
import { isOpen, type Task } from "../tasks/model";

/** Hard cap on Must-dos per day (PRD TODAY-2). */
export const MUST_DO_LIMIT = 3;
/** Stale rules (PRD §8.1). */
export const STALE_POSTPONES = 3;
export const STALE_UNTOUCHED_DAYS = 14;
/** Tasks at or above this effort get a next-step prompt when planned for today (TASK-4). */
export const NEXT_STEP_EFFORT = 3;

/** The day a task is planned for: its scheduled day, else its due day. */
export function planDay(t: Pick<Task, "scheduledDate" | "dueDate">): Day | null {
  return t.scheduledDate ?? t.dueDate ?? null;
}

export function isMustDoOn(t: Pick<Task, "mustDoDate">, day: Day): boolean {
  return t.mustDoDate === day;
}

/**
 * Stale: moved 3+ times, or planned (in progress, or planned for today or earlier) and not
 * touched for 14 days. Resolving it resets the postpone count and touches the task.
 */
export function isStale(t: Task, todayDay: Day, now: number): boolean {
  if (!isOpen(t) || t.parentTaskId || t.status === "inbox") return false;
  if ((t.postponeCount ?? 0) >= STALE_POSTPONES) return true;
  const day = planDay(t);
  const planned = t.status === "in_progress" || (day != null && day <= todayDay);
  return planned && now - t.updatedAt >= STALE_UNTOUCHED_DAYS * 86_400_000;
}

/** Why a task is stale, in Orbit's voice (DESIGN.md §13). */
export function staleReason(t: Task, now: number): string {
  const n = t.postponeCount ?? 0;
  if (n >= STALE_POSTPONES) return `Postponed ${n}×`;
  return `Untouched for ${Math.floor((now - t.updatedAt) / 86_400_000)} days`;
}

export function needsNextStepPrompt(t: Pick<Task, "effort" | "nextStep" | "status">): boolean {
  return isOpen(t) && (t.effort ?? 0) >= NEXT_STEP_EFFORT && !t.nextStep;
}

export interface Capacity {
  planned: number;
  done: number;
  capacity: number;
  unestimated: number;
  over: number;
}

export interface TodayPlan {
  stale: Task[];
  mustDos: Task[];
  also: Task[];
  overdue: Task[];
  doneToday: Task[];
  capacity: Capacity;
}

const byOrder = (a: Task, b: Task) => a.order - b.order;

/** Splits tasks into the Today sections (PRD TODAY-1, §8.1). Pure, so it can be unit tested. */
export function buildToday(
  tasks: Task[],
  opts: { today: Day; now: number; timezone: string; capacity: number },
): TodayPlan {
  const { today, now, timezone } = opts;
  const top = tasks.filter((t) => !t.parentTaskId && t.deletedAt == null);
  const completedToday = (t: Task) =>
    t.status === "done" && t.completedAt != null && dayOf(t.completedAt, timezone) === today;

  const stale = top.filter((t) => isStale(t, today, now) && !isMustDoOn(t, today)).sort(byOrder);
  const staleIds = new Set(stale.map((t) => t.id));

  const mustDos = top
    .filter((t) => isMustDoOn(t, today) && (isOpen(t) || completedToday(t)))
    .sort(byOrder)
    .slice(0, MUST_DO_LIMIT);
  const mustIds = new Set(mustDos.map((t) => t.id));

  const rest = top.filter((t) => isOpen(t) && !staleIds.has(t.id) && !mustIds.has(t.id));
  const overdue = rest.filter((t) => {
    const d = planDay(t);
    return d != null && d < today;
  });
  const overdueIds = new Set(overdue.map((t) => t.id));
  const also = rest
    .filter(
      (t) => !overdueIds.has(t.id) && (planDay(t) === today || (t.status === "in_progress" && planDay(t) == null)),
    )
    .sort(byOrder);
  const doneToday = top
    .filter((t) => completedToday(t) && !mustIds.has(t.id))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const planned = [...mustDos, ...also, ...doneToday];
  const pts = (list: Task[]) => list.reduce((sum, t) => sum + (t.effort ?? 0), 0);
  const plannedPts = pts(planned);
  return {
    stale,
    mustDos,
    also,
    overdue: overdue.sort((a, b) => (planDay(a) ?? "").localeCompare(planDay(b) ?? "") || byOrder(a, b)),
    doneToday,
    capacity: {
      planned: plannedPts,
      done: pts(planned.filter((t) => t.status === "done")),
      capacity: opts.capacity,
      unestimated: planned.filter((t) => isOpen(t) && !t.effort).length,
      over: Math.max(0, plannedPts - opts.capacity),
    },
  };
}

/** Open, top-level tasks planned in the next `days` days (tomorrow onwards), grouped by day. */
export function buildUpcoming(tasks: Task[], todayDay: Day, days = 14): { day: Day; tasks: Task[] }[] {
  const end = addDays(todayDay, days);
  const groups = new Map<Day, Task[]>();
  for (const t of tasks) {
    if (t.parentTaskId || t.deletedAt != null || !isOpen(t)) continue;
    const d = planDay(t);
    if (!d || d <= todayDay || d > end) continue;
    groups.set(d, [...(groups.get(d) ?? []), t]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, tasks: list.sort(byOrder) }));
}

/** The `order` that puts an item between its new neighbours, so a reorder writes one document. */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before == null && after == null) return Date.now();
  if (before == null) return after! - 1000;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}

/** Days a task has been overdue (for the Overdue section label). */
export function overdueDays(t: Task, todayDay: Day): number {
  const d = planDay(t);
  return d ? daysBetween(d, todayDay) : 0;
}

// ---------------------------------------------------------------- skip flow (PRD §8.2)

export const SKIP_REASONS = [
  { id: "too_big", label: "Too big", hint: "Break it into smaller steps." },
  { id: "unclear", label: "Unclear what to do", hint: "Write the very next step." },
  { id: "no_time", label: "No time", hint: "Pick a day that has room." },
  { id: "low_energy", label: "Low energy", hint: "Try the 5-minute version, or move it." },
  { id: "waiting", label: "Waiting on something", hint: "Pick a day to follow up." },
  { id: "avoiding", label: "Avoiding it", hint: "Start with just 5 minutes." },
  { id: "not_important", label: "Not important anymore", hint: "Cancel it and move on." },
  { id: "other", label: "Other", hint: "Say what's in the way." },
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number]["id"];

export function skipReasonLabel(id: string | null): string | null {
  return SKIP_REASONS.find((r) => r.id === id)?.label ?? id;
}

/** A move is a skip (reason asked) when the task was planned for today or earlier and is moved later or off the plan. */
export function isSkip(t: Pick<Task, "scheduledDate" | "dueDate" | "mustDoDate">, todayDay: Day, to: Day | null) {
  const from = planDay(t);
  const planned = (from != null && from <= todayDay) || t.mustDoDate === todayDay;
  return planned && (to == null || to > todayDay);
}

/** Greeting for the hour in the user's timezone. */
export function greeting(now: number, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)),
  );
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
