import { daysBetween, type Day } from "@/lib/dates";
import type { EntityFields, GOAL_HEALTH, GOAL_STATUSES, SyncedDoc } from "@/lib/sync/entities";
import { isOpen, type Task } from "@/features/tasks/model";

export type GoalFields = EntityFields<"goals">;
export type Goal = SyncedDoc<"goals">;
export type KeyResult = SyncedDoc<"keyResults">;
export type Milestone = SyncedDoc<"milestones">;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type GoalHealth = (typeof GOAL_HEALTH)[number];

export function newGoalFields(partial: Partial<GoalFields> & { title: string }): GoalFields {
  return {
    areaId: null,
    description: "",
    status: "active",
    health: null,
    priority: "none",
    startDate: null,
    targetDate: null,
    droppedReason: null,
    completedAt: null,
    order: Date.now(),
    ...partial,
  };
}

export const GOAL_STATUS_META: Record<GoalStatus, { label: string }> = {
  planned: { label: "Planned" },
  active: { label: "Active" },
  paused: { label: "Paused" },
  completed: { label: "Completed" },
  dropped: { label: "Dropped" },
};

export const HEALTH_META: Record<GoalHealth, { label: string; tone: "success" | "warning" | "danger" }> = {
  on_track: { label: "On track", tone: "success" },
  at_risk: { label: "At risk", tone: "warning" },
  off_track: { label: "Off track", tone: "danger" },
};

/** 0..1 progress of a single key result. */
export function krProgress(kr: Pick<KeyResult, "type" | "start" | "target" | "current">): number {
  if (kr.type === "boolean") return kr.current >= 1 ? 1 : 0;
  const span = kr.target - kr.start;
  if (span === 0) return kr.current >= kr.target ? 1 : 0;
  return Math.max(0, Math.min(1, (kr.current - kr.start) / span));
}

const EFFORT_FALLBACK = 1;

/**
 * Goal progress (PRD GOAL-5): the average of its key results if it has any,
 * otherwise the effort-weighted share of its tasks that are done.
 */
export function goalProgress(krs: KeyResult[], tasks: Task[]): number {
  const liveKrs = krs.filter((k) => !k.deletedAt);
  if (liveKrs.length) return liveKrs.reduce((s, k) => s + krProgress(k), 0) / liveKrs.length;
  const counted = tasks.filter((t) => !t.deletedAt && t.status !== "cancelled" && !t.parentTaskId);
  if (!counted.length) return 0;
  const weight = (t: Task) => t.effort ?? EFFORT_FALLBACK;
  const total = counted.reduce((s, t) => s + weight(t), 0);
  return counted.filter((t) => t.status === "done").reduce((s, t) => s + weight(t), 0) / total;
}

/** Suggested health from progress vs. time elapsed between start (or creation) and target. */
export function suggestHealth(
  goal: Pick<Goal, "startDate" | "targetDate" | "createdAt">,
  progress: number,
  todayDay: Day,
  createdDay: Day,
): GoalHealth | null {
  if (!goal.targetDate) return null;
  const start = goal.startDate ?? createdDay;
  const total = daysBetween(start, goal.targetDate);
  if (total <= 0) return progress >= 1 ? "on_track" : "off_track";
  const expected = Math.max(0, Math.min(1, daysBetween(start, todayDay) / total));
  if (progress >= expected - 0.1) return "on_track";
  if (progress >= expected - 0.25) return "at_risk";
  return "off_track";
}

/** PRD GOAL-6: an active goal must always have at least one open task. */
export function needsNextStep(goal: Pick<Goal, "status">, tasks: Task[]): boolean {
  return goal.status === "active" && !tasks.some((t) => !t.deletedAt && isOpen(t) && !t.parentTaskId);
}
