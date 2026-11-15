import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { weekday, type Day } from "@/lib/dates";

/** Phase 3C (HAB-5): routines — ordered checklists run one step at a time. Pure rules. */

export type Routine = SyncedDoc<"routines">;
export type RoutineFields = EntityFields<"routines">;
export type RoutineStep = RoutineFields["steps"][number];
export type RoutineRun = SyncedDoc<"routineRuns">;

/** One run per routine per day, the same on every device. */
export function routineRunId(routineId: string, date: Day): string {
  return `rr${date.replaceAll("-", "")}${routineId}`.slice(0, 40);
}

/** Step ids are short and unique within a routine. */
export function newStepId(existing: { id: string }[]): string {
  const used = new Set(existing.map((s) => s.id));
  for (let n = existing.length + 1; ; n++) {
    const id = `s${n}`;
    if (!used.has(id)) return id;
  }
}

export const ROUTINE_XP = 10;

export const ROUTINE_KIND_LABEL: Record<RoutineFields["kind"], string> = {
  morning: "Morning",
  evening: "Evening",
  other: "Routine",
};

export function newRoutineFields(p: Partial<RoutineFields> & { name: string }): RoutineFields {
  return {
    name: p.name.trim(),
    kind: p.kind ?? "morning",
    steps: p.steps ?? [],
    days: p.days ?? [],
    reminderTime: p.reminderTime ?? null,
    order: p.order ?? Date.now(),
    archivedAt: null,
  };
}

/** Is the routine meant for this day? (No days chosen means every day.) */
export function routineDueOn(r: Pick<Routine, "days" | "archivedAt">, day: Day): boolean {
  return r.archivedAt == null && (!r.days.length || r.days.includes(weekday(day)));
}

export interface RunProgress {
  done: number;
  total: number;
  /** The first step not yet done or skipped, if any. */
  next: RoutineStep | null;
  complete: boolean;
  /** Minutes for the steps still to go (steps with a length). */
  minutesLeft: number;
}

export function runProgress(
  r: Pick<Routine, "steps">,
  run: Pick<RoutineRun, "doneStepIds" | "skippedStepIds" | "completedAt"> | undefined,
): RunProgress {
  const done = new Set(run?.doneStepIds ?? []);
  const skipped = new Set(run?.skippedStepIds ?? []);
  const left = r.steps.filter((s) => !done.has(s.id) && !skipped.has(s.id));
  return {
    done: r.steps.filter((s) => done.has(s.id)).length,
    total: r.steps.length,
    next: left[0] ?? null,
    complete: run?.completedAt != null || (r.steps.length > 0 && left.length === 0),
    minutesLeft: left.reduce((n, s) => n + (s.minutes ?? 0), 0),
  };
}

/** Total minutes a routine takes (steps with a length). */
export function routineMinutes(r: Pick<Routine, "steps">): number {
  return r.steps.reduce((n, s) => n + (s.minutes ?? 0), 0);
}
