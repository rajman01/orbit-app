import type { Task } from "@/features/tasks/model";
import { addDays, daysBetween, weekday, type Day } from "@/lib/dates";
import type { LearningFields } from "./model";

/**
 * Phase 3F (CAR-6): a course or book in sections, planned to a target date. Sections become
 * ordinary tasks (so cycles, Today, focus and insights just work); progress and pace follow the
 * sections done. Pure rules.
 */

export type Section = NonNullable<LearningFields["sections"]>[number];
export type CoursePlan = NonNullable<LearningFields["plan"]>;

export const DEFAULT_SECTION_MINUTES = 30;
export const WEEKDAYS = [1, 2, 3, 4, 5];

export const sectionMinutes = (s: Pick<Section, "minutes">) => s.minutes ?? DEFAULT_SECTION_MINUTES;

/** A section's size in points, from its length (30 min = 1 point … 4 hours = 5). */
export function effortFor(minutes: number): 1 | 2 | 3 | 5 | 8 {
  if (minutes <= 30) return 1;
  if (minutes <= 60) return 2;
  if (minutes <= 120) return 3;
  if (minutes <= 240) return 5;
  return 8;
}

export interface Schedule {
  /** Each section still to do and the day it's planned for, in order. */
  days: { sectionId: string; day: Day }[];
  /** The last study day used. */
  finish: Day | null;
  /** True when it doesn't fit by the target date at this pace. */
  late: boolean;
  /** Study days available between the start and the target. */
  studyDays: number;
}

/**
 * Spreads the sections still to do over the study days from `start`, filling each day up to
 * `minutesPerDay` (a section longer than that gets a day to itself), in order. If they don't fit by
 * the target date it keeps going, so the finish date shows how much later it would end.
 */
export function scheduleSections(
  sections: Pick<Section, "id" | "minutes" | "doneAt">[],
  opts: { start: Day; targetDate: Day; days: number[]; minutesPerDay: number },
): Schedule {
  const todo = sections.filter((s) => s.doneAt == null);
  const isStudyDay = (d: Day) => opts.days.includes(weekday(d));
  let studyDays = 0;
  for (let d = opts.start; d <= opts.targetDate; d = addDays(d, 1)) if (isStudyDay(d)) studyDays++;
  const out: Schedule["days"] = [];
  let day = opts.start;
  let used = 0;
  // Move to the first study day.
  for (let guard = 0; !isStudyDay(day) && guard < 7; guard++) day = addDays(day, 1);
  for (const s of todo) {
    const m = sectionMinutes(s);
    if (used > 0 && used + m > opts.minutesPerDay) {
      day = addDays(day, 1);
      for (let guard = 0; !isStudyDay(day) && guard < 7; guard++) day = addDays(day, 1);
      used = 0;
    }
    out.push({ sectionId: s.id, day });
    used += m;
  }
  const finish = out.length ? out[out.length - 1].day : null;
  return { days: out, finish, late: finish != null && finish > opts.targetDate, studyDays };
}

/** Sections done, out of all, as 0–100. */
export function sectionProgress(sections: Pick<Section, "doneAt">[]): number {
  if (!sections.length) return 0;
  return Math.round((sections.filter((s) => s.doneAt != null).length / sections.length) * 100);
}

export interface CoursePace {
  done: number;
  total: number;
  /** Sections done, or planned for a day that has passed (today's aren't late yet). */
  due: number;
  /** How many sections behind the plan (0 when on pace). */
  behind: number;
  next: Section | null;
  nextDay: Day | null;
  daysLeft: number | null;
}

/** Where a planned course stands against its plan today. */
export function coursePace(
  sections: Section[],
  tasks: Pick<Task, "id" | "scheduledDate" | "deletedAt">[],
  plan: CoursePlan | null | undefined,
  today: Day,
): CoursePace {
  const byId = new Map(tasks.filter((t) => t.deletedAt == null).map((t) => [t.id, t]));
  const dayOf = (s: Section) => (s.taskId ? (byId.get(s.taskId)?.scheduledDate ?? null) : null);
  const done = sections.filter((s) => s.doneAt != null).length;
  const due = sections.filter((s) => s.doneAt != null || (dayOf(s) ?? "9999") < today).length;
  const next = sections.find((s) => s.doneAt == null) ?? null;
  return {
    done,
    total: sections.length,
    due,
    behind: plan ? Math.max(0, due - done) : 0,
    next,
    nextDay: next ? dayOf(next) : null,
    daysLeft: plan ? daysBetween(today, plan.targetDate) : null,
  };
}

/** Lines of a pasted syllabus → sections ("1. Intro (45 min)", "- Week 2: Arrays — 1h"). */
export function sectionsFromText(text: string): { title: string; minutes: number | null }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|(?:module|week|chapter|lesson|part)\s*\d+\s*[:.\-–—]?)\s*/i, "").trim())
    .filter((l) => l.length > 1)
    .slice(0, 200)
    .map((l) => {
      const m = l.match(/[(\-–—,]?\s*(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)\)?\s*$/i);
      if (!m) return { title: l.slice(0, 200), minutes: null };
      const n = Number(m[1]);
      const minutes = Math.round(/^h/i.test(m[2]) ? n * 60 : n);
      const title =
        l
          .slice(0, m.index)
          .replace(/[\s(\-–—,:]+$/, "")
          .trim() || l;
      return { title: title.slice(0, 200), minutes: minutes >= 5 && minutes <= 600 ? minutes : null };
    });
}
