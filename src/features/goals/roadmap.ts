import { addDays, daysBetween, type Day } from "@/lib/dates";
import { isOpen, type Task } from "@/features/tasks/model";
import type { Goal, Milestone } from "./model";

/**
 * A goal's roadmap: a path from its start to its target date, with each dated milestone as a stop
 * at its date. Pure, so the drawing and the tests share it.
 */

export type StopState = "done" | "current" | "behind" | "upcoming";

export type RoadmapStop = {
  milestone: Milestone;
  day: Day;
  /** 0 at the start of the path, 1 at its end. */
  at: number;
  state: StopState;
  /** Why it's behind, when it is. */
  behind: "overdue" | "pace" | null;
  done: number;
  total: number;
  /** The first open task, if any. */
  next: Task | null;
};

export type Roadmap = {
  start: Day;
  end: Day;
  /** Whether the end is the goal's own target date (shown as the finish) or just the last milestone. */
  hasTarget: boolean;
  stops: RoadmapStop[];
  /** Milestones without a date: listed, not placed. */
  undated: Milestone[];
  /** Where today sits, 0..1 (clamped), and whether it's past the end. */
  today: number;
  pastEnd: boolean;
  ticks: { at: number; label: string; major: boolean }[];
};

const MONTH = (m: number) =>
  new Date(Date.UTC(2000, m, 1)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });

export function buildRoadmap(
  goal: Pick<Goal, "startDate" | "targetDate">,
  milestones: Milestone[],
  tasks: Task[],
  todayDay: Day,
  createdDay: Day,
): Roadmap | null {
  const live = milestones.filter((m) => !m.deletedAt);
  const dated = live.filter((m) => m.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.order - b.order);
  const undated = live.filter((m) => !m.dueDate);
  if (!goal.targetDate && !dated.length) return null;

  const first = dated[0]?.dueDate ?? null;
  const last = dated.at(-1)?.dueDate ?? null;
  let start = goal.startDate ?? createdDay;
  if (first && first < start) start = first;
  let end = goal.targetDate ?? last!;
  if (last && last > end) end = last;
  if (end <= start) end = addDays(start, 30);
  const span = daysBetween(start, end);
  const at = (d: Day) => Math.max(0, Math.min(1, daysBetween(start, d) / span));

  let currentFound = false;
  let previous = start;
  const stops = dated.map((m): RoadmapStop => {
    const own = tasks.filter((t) => t.milestoneId === m.id && !t.deletedAt && !t.parentTaskId);
    const counted = own.filter((t) => t.status !== "cancelled");
    const done = counted.filter((t) => t.status === "done").length;
    const next = own.find(isOpen) ?? null;
    const day = m.dueDate!;
    let state: StopState = "upcoming";
    let behind: RoadmapStop["behind"] = null;
    if (m.doneAt != null) state = "done";
    else {
      if (day < todayDay) behind = "overdue";
      else if (counted.length) {
        // Measured over the stretch since the stop before it: the share of the way there in time,
        // against the share of its tasks done. Only judged past halfway, so a fresh stretch isn't flagged.
        const window = daysBetween(previous, day);
        const elapsed = window > 0 ? Math.max(0, Math.min(1, daysBetween(previous, todayDay) / window)) : 1;
        if (elapsed >= 0.5 && done / counted.length < elapsed - 0.25) behind = "pace";
      }
      if (behind) state = "behind";
      else if (!currentFound) state = "current";
      if (!currentFound) currentFound = true;
    }
    previous = day;
    return { milestone: m, day, at: at(day), state, behind, done, total: counted.length, next };
  });

  return {
    start,
    end,
    hasTarget: goal.targetDate != null,
    stops,
    undated,
    today: at(todayDay),
    pastEnd: todayDay > end,
    ticks: ticks(start, end, at),
  };
}

/** Years along a long path; months along one of about a year and a half or less. */
function ticks(start: Day, end: Day, at: (d: Day) => number): Roadmap["ticks"] {
  const out: Roadmap["ticks"] = [];
  const months = daysBetween(start, end) <= 550;
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7)) - 1;
  for (let i = 0; i < 400; i++) {
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
    const d = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    if (d > end) break;
    if (months) out.push({ at: at(d), label: m === 0 ? String(y) : MONTH(m), major: m === 0 });
    else if (m === 0) out.push({ at: at(d), label: String(y), major: true });
  }
  return out;
}

/** "Feb 2027" */
export function monthYear(day: Day): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The day a point along the path stands for. */
export function dayAt(road: Pick<Roadmap, "start" | "end">, at: number): Day {
  return addDays(road.start, Math.round(Math.max(0, Math.min(1, at)) * daysBetween(road.start, road.end)));
}
