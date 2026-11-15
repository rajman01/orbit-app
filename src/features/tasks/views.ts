import type { EntityFields } from "@/lib/sync/entities";
import { isOpen, type Task } from "./model";

/** CMD-4: the Tasks page's filters, as saved in a view. */
export type TaskFilters = EntityFields<"savedViews">["filters"];

export const DEFAULT_FILTERS: TaskFilters = {
  areaId: null,
  goalId: null,
  priorities: [],
  cycle: "any",
  showDone: false,
  groupBy: "status",
  view: "list",
};

/** The top-level, non-Inbox tasks the filters let through. */
export function filterTasks(tasks: Task[], f: TaskFilters, currentCycleId: string | null): Task[] {
  return tasks.filter(
    (t) =>
      !t.parentTaskId &&
      t.status !== "inbox" &&
      (f.showDone || isOpen(t)) &&
      (!f.areaId || t.areaId === f.areaId) &&
      (!f.goalId || t.goalId === f.goalId) &&
      (!f.priorities.length || f.priorities.includes(t.priority)) &&
      (f.cycle === "any" || (f.cycle === "none" ? !t.cycleId : currentCycleId != null && t.cycleId === currentCycleId)),
  );
}

/** Whether two sets of filters show the same thing (so "Save view" knows there's something new). */
export function sameFilters(a: TaskFilters, b: TaskFilters): boolean {
  return (
    a.areaId === b.areaId &&
    a.goalId === b.goalId &&
    a.cycle === b.cycle &&
    a.showDone === b.showDone &&
    a.groupBy === b.groupBy &&
    a.view === b.view &&
    [...a.priorities].sort().join() === [...b.priorities].sort().join()
  );
}

/** A suggested name for a view, from its filters: "Career, high and above, not in a cycle". */
export function suggestViewName(f: TaskFilters, names: { area?: string; goal?: string; priorities?: string }): string {
  const parts: string[] = [];
  if (names.area) parts.push(names.area);
  if (names.goal) parts.push(names.goal);
  if (f.priorities.length && names.priorities) parts.push(names.priorities.toLowerCase());
  if (f.cycle === "current") parts.push("this cycle");
  if (f.cycle === "none") parts.push("not in a cycle");
  const s = parts.join(", ");
  return s ? s[0].toUpperCase() + s.slice(1) : "My view";
}

/** TASK-7: the ids between two rows (inclusive), in list order, for Shift-click. */
export function rangeBetween(order: string[], from: string, to: string): string[] {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}
