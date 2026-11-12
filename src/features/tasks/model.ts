import { addDays, addMonths, weekday, type Day } from "@/lib/dates";
import type { EntityFields, PRIORITIES, Recurrence, SyncedDoc, TASK_STATUSES } from "@/lib/sync/entities";

export type TaskFields = EntityFields<"tasks">;
export type Task = SyncedDoc<"tasks">;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** Full field set for a new task; callers override what they know. */
export function newTaskFields(partial: Partial<TaskFields> & { title: string }): TaskFields {
  return {
    description: "",
    status: "inbox",
    priority: "none",
    effort: null,
    areaId: null,
    goalId: null,
    milestoneId: null,
    parentTaskId: null,
    dueDate: null,
    scheduledDate: null,
    nextStep: null,
    tags: [],
    recurrence: null,
    recurrenceParentId: null,
    completedAt: null,
    cancelledAt: null,
    createdBy: "user",
    order: Date.now(),
    mustDoDate: null,
    postponeCount: 0,
    ...partial,
  };
}

/** Phase 0 tasks only had a few fields; fill the rest so the UI never sees undefined. */
export function withTaskDefaults(t: Task): Task {
  return { ...newTaskFields({ title: t.title, order: t.order }), ...t } as Task;
}

export const isOpen = (t: Pick<Task, "status">) => t.status !== "done" && t.status !== "cancelled";

export function taskCode(t: Pick<Task, "number">): string | null {
  return t.number ? `ORB-${t.number}` : null;
}

export const STATUS_META: Record<TaskStatus, { label: string }> = {
  inbox: { label: "Inbox" },
  backlog: { label: "Backlog" },
  todo: { label: "Todo" },
  in_progress: { label: "In progress" },
  done: { label: "Done" },
  cancelled: { label: "Cancelled" },
};

export const PRIORITY_META: Record<Priority, { label: string; rank: number; shortcut: string }> = {
  urgent: { label: "Urgent", rank: 0, shortcut: "1" },
  high: { label: "High", rank: 1, shortcut: "2" },
  medium: { label: "Medium", rank: 2, shortcut: "3" },
  low: { label: "Low", rank: 3, shortcut: "4" },
  none: { label: "No priority", rank: 4, shortcut: "0" },
};

/** Sort: open before closed, then priority, then due date, then manual order. */
export function compareTasks(a: Task, b: Task): number {
  return (
    Number(!isOpen(a)) - Number(!isOpen(b)) ||
    PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank ||
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    a.order - b.order
  );
}

// ---------------------------------------------------------------- recurrence

/**
 * The next due day of a recurring task.
 * fixed: continues the schedule from the previous due day (or today if none). Completed late,
 * it jumps to the first scheduled day after the completion day, so the next one is never
 * already overdue (owner decision, 2026-11-12).
 * after_completion: counts from the day it was completed.
 */
export function nextOccurrence(rule: Recurrence, previousDue: Day | null, completedOn: Day): Day {
  if (rule.mode !== "fixed" || !previousDue) return stepOccurrence(rule, completedOn);
  let next = stepOccurrence(rule, previousDue);
  for (let i = 0; next <= completedOn && i < 5000; i++) next = stepOccurrence(rule, next);
  return next;
}

/** One step along the schedule from `base`. */
function stepOccurrence(rule: Recurrence, base: Day): Day {
  if (rule.freq === "daily") return addDays(base, rule.interval);
  if (rule.freq === "monthly") return addMonths(base, rule.interval);

  const days = (rule.byWeekday?.length ? rule.byWeekday : [weekday(base)]).slice().sort();
  // Next matching weekday after `base`, jumping `interval` weeks after the last one in a week.
  for (let i = 1; i <= 7; i++) {
    const candidate = addDays(base, i);
    const wd = weekday(candidate);
    if (!days.includes(wd)) continue;
    const wrapped = wd <= weekday(base);
    return wrapped && rule.interval > 1 ? addDays(candidate, 7 * (rule.interval - 1)) : candidate;
  }
  return addDays(base, 7 * rule.interval);
}

/** Deterministic id for the next instance, so two devices completing the same one create one successor. */
export function nextInstanceId(rootId: string, due: Day): string {
  return `${rootId}${due.replaceAll("-", "")}`.slice(0, 40);
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function recurrenceLabel(rule: Recurrence | null): string | null {
  if (!rule) return null;
  const every = (unit: string) => (rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`);
  if (rule.freq === "daily") return every("day");
  if (rule.freq === "monthly") return every("month");
  const on = rule.byWeekday?.length ? ` on ${rule.byWeekday.map((d) => WD[d]).join(", ")}` : "";
  return every("week") + on;
}
