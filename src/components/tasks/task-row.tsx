"use client";

import { Repeat, Target } from "lucide-react";
import { AreaDot } from "@/components/areas/area-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { useActions } from "@/features/actions";
import type { Area } from "@/features/data";
import type { Goal } from "@/features/goals/model";
import { isOpen, taskCode, type Task } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";
import { PriorityIcon } from "./icons";
import { useTaskPanel } from "./task-panel";

/** DESIGN.md §11.2 — the task row used everywhere. */
export function TaskRow({
  task,
  area,
  goal,
  subtaskCount,
  showGoal = true,
  className,
}: {
  task: Task;
  area?: Area;
  goal?: Goal;
  subtaskCount?: { done: number; total: number };
  showGoal?: boolean;
  className?: string;
}) {
  const actions = useActions();
  const panel = useTaskPanel();
  const todayDay = useToday();
  const done = task.status === "done";
  const overdue = isOpen(task) && task.dueDate != null && task.dueDate < todayDay;
  const code = taskCode(task);

  return (
    <div
      role="button"
      tabIndex={0}
      data-task-row={task.id}
      aria-label={`Open ${task.title}`}
      onClick={() => panel.open(task.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") panel.open(task.id);
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void actions.setTaskDone(task, !done);
      }}
      className={cn(
        "group flex min-h-row cursor-default items-center gap-1 rounded-md pr-2 pl-1 outline-none select-none",
        "hover:bg-fill focus-visible:bg-fill focus-visible:ring-2 focus-visible:ring-accent",
        panel.taskId === task.id && "bg-accent-fill",
        className,
      )}
    >
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={done} onChange={(d) => void actions.setTaskDone(task, d)} label={`Complete ${task.title}`} />
      </span>
      <PriorityIcon priority={task.priority} className="hidden lg:block" />
      {code ? (
        <span className="hidden w-14 shrink-0 font-mono text-caption text-label-tertiary lg:inline">{code}</span>
      ) : null}
      <div className="min-w-0 flex-1 py-1.5">
        <p className={cn("truncate", done && "text-label-tertiary line-through")}>{task.title}</p>
        {task.nextStep && !done ? (
          <p className="truncate text-footnote text-label-secondary">↳ {task.nextStep}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5 text-footnote text-label-secondary">
        {subtaskCount && subtaskCount.total > 0 ? (
          <span className="tabular">
            {subtaskCount.done}/{subtaskCount.total}
          </span>
        ) : null}
        {task.recurrence ? <Repeat className="size-3.5" strokeWidth={1.75} aria-label="Repeats" /> : null}
        {showGoal && goal ? (
          <span className="hidden max-w-40 items-center gap-1 truncate md:flex">
            <Target className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">{goal.title}</span>
          </span>
        ) : null}
        {task.effort ? <span className="hidden tabular sm:inline">{task.effort}pt</span> : null}
        {task.dueDate ? (
          <span className={cn("tabular", overdue && "font-medium text-danger-text")}>
            {dayLabel(task.dueDate, todayDay)}
          </span>
        ) : null}
        {area ? <AreaDot color={area.color} /> : null}
      </div>
    </div>
  );
}
