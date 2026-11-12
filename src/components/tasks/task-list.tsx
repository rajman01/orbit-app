"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { type Area, useAllTasks, useAreas, useGoals } from "@/features/data";
import type { Goal } from "@/features/goals/model";
import { compareTasks, type Task } from "@/features/tasks/model";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { TaskRow } from "./task-row";

/** Areas, goals and subtask counts keyed by id, for rendering rows. */
export function useTaskLookups() {
  const areas = useAreas({ includeArchived: true });
  const goals = useGoals();
  const all = useAllTasks();
  return useMemo(() => {
    const areaById = new Map<string, Area>((areas ?? []).map((a) => [a.id, a]));
    const goalById = new Map<string, Goal>((goals ?? []).map((g) => [g.id, g]));
    const subtasks = new Map<string, { done: number; total: number }>();
    for (const t of all ?? []) {
      if (!t.parentTaskId) continue;
      const c = subtasks.get(t.parentTaskId) ?? { done: 0, total: 0 };
      c.total++;
      if (t.status === "done") c.done++;
      subtasks.set(t.parentTaskId, c);
    }
    return { areaById, goalById, subtasks, ready: areas !== undefined && goals !== undefined && all !== undefined };
  }, [areas, goals, all]);
}

export function TaskList({
  tasks,
  showGoal = true,
  sort = true,
  label,
}: {
  tasks: Task[];
  showGoal?: boolean;
  sort?: boolean;
  label?: string;
}) {
  const { areaById, goalById, subtasks } = useTaskLookups();
  const { transition } = useOrbitMotion();
  const rows = sort ? [...tasks].sort(compareTasks) : tasks;
  return (
    <ul aria-label={label} className="flex flex-col">
      <AnimatePresence initial={false}>
        {rows.map((t) => (
          <motion.li
            key={t.id}
            layout="position"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition("default")}
          >
            <TaskRow
              task={t}
              area={t.areaId ? areaById.get(t.areaId) : undefined}
              goal={t.goalId ? goalById.get(t.goalId) : undefined}
              subtaskCount={subtasks.get(t.id)}
              showGoal={showGoal}
            />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="mt-6 mb-1 flex items-center gap-2 px-1 text-micro text-label-secondary uppercase first:mt-0">
      {children}
      {count != null ? <span className="text-label-tertiary tabular">{count}</span> : null}
    </h2>
  );
}
