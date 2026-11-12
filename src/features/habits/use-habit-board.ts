"use client";

import { useMemo } from "react";
import { dayOf } from "@/lib/dates";
import { useHabitLogs, useHabits, useSettings, type HabitDoc, type HabitLogDoc } from "../data";
import { useToday } from "../use-today";
import { habitLogId, habitStatus, type HabitStatus } from "./model";

export interface HabitBoardItem {
  habit: HabitDoc;
  status: HabitStatus;
  todayLog?: HabitLogDoc;
}

/** Live habits with today's status and streak. */
export function useHabitBoard(): { items: HabitBoardItem[] | undefined; today: string } {
  const habits = useHabits();
  const logs = useHabitLogs();
  const settings = useSettings();
  const today = useToday();
  const items = useMemo(() => {
    if (!habits || !logs) return undefined;
    const byHabit = new Map<string, HabitLogDoc[]>();
    for (const l of logs) byHabit.set(l.habitId, [...(byHabit.get(l.habitId) ?? []), l]);
    return habits.map((habit) => {
      const own = byHabit.get(habit.id) ?? [];
      return {
        habit,
        todayLog: own.find((l) => l.id === habitLogId(habit.id, today)),
        status: habitStatus(habit, own, today, {
          weekStart: settings.weekStartDay,
          startDay: dayOf(habit.createdAt, settings.timezone),
        }),
      };
    });
  }, [habits, logs, today, settings.weekStartDay, settings.timezone]);
  return { items, today };
}
