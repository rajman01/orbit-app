"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useAllTasks, useGoals, useKeyResults, useQuarters, useSettings } from "@/features/data";
import { goalProgress, suggestHealth, type Goal, type GoalHealth } from "@/features/goals/model";
import { useToday } from "@/features/use-today";
import { dayOf } from "@/lib/dates";
import { elapsedShare, pace, quarterDates, quarterId, type Pace, type Quarter, type QuarterRef } from "./model";

export interface QuarterGoal {
  goal: Goal;
  progress: number;
  health: GoalHealth | null;
  pace: Pace;
}

/** A quarter (its document may not exist yet), its goals with progress and pace, and time gone. */
export function useQuarter(ref: QuarterRef | null) {
  const user = useCurrentUser();
  const quarters = useQuarters();
  const goals = useGoals();
  const krs = useKeyResults();
  const tasks = useAllTasks();
  const todayDay = useToday();
  const { timezone } = useSettings();
  const year = ref?.year;
  const q = ref?.q;
  return useMemo(() => {
    if (year == null || q == null || !quarters || !goals || !krs || !tasks) return undefined;
    const ref = { year, q };
    const id = quarterId(user.id, ref);
    const doc: Quarter | null = quarters.find((x) => x.id === id) ?? null;
    const dates = quarterDates(ref);
    const elapsed = elapsedShare(dates, todayDay);
    const items: QuarterGoal[] = (doc?.goalIds ?? [])
      .map((gid) => goals.find((g) => g.id === gid))
      .filter((g) => g != null)
      .map((goal) => {
        const progress = goalProgress(
          krs.filter((k) => k.goalId === goal.id),
          tasks.filter((t) => t.goalId === goal.id),
        );
        return {
          goal,
          progress,
          health: goal.health ?? suggestHealth(goal, progress, todayDay, dayOf(goal.createdAt, timezone)),
          pace: goal.status === "completed" ? "on_pace" : pace(progress, elapsed),
        };
      });
    const live = items.filter((i) => i.goal.status !== "dropped");
    const progress = live.length ? live.reduce((s, i) => s + i.progress, 0) / live.length : 0;
    return { id, doc, ref, dates, elapsed, items, progress, pace: pace(progress, elapsed) };
  }, [year, q, quarters, goals, krs, tasks, todayDay, timezone, user.id]);
}
