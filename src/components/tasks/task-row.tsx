"use client";

import { AlertTriangle, CalendarClock, Check, PanelRight, Play, Repeat, Star, Target, Trash2 } from "lucide-react";
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/menu";
import { useIsDesktop } from "@/lib/use-media-query";
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
import { SwipeRow } from "./swipe-row";
import { useSkipFlow } from "@/components/skip/skip-flow";
import { useFocus } from "@/components/focus/focus-mode";

/** DESIGN.md §11.2 — the task row used everywhere. */
export function TaskRow({
  task,
  area,
  goal,
  subtaskCount,
  showGoal = true,
  className,
  mustDo = false,
  showStart = false,
  staleLabel,
  onToggleMustDo,
  onPromptNextStep,
  handle,
  swipe = true,
}: {
  task: Task;
  area?: Area;
  goal?: Goal;
  subtaskCount?: { done: number; total: number };
  showGoal?: boolean;
  className?: string;
  /** Today (DESIGN.md §11.2): Must-dos are taller, bolder and starred. */
  mustDo?: boolean;
  /** Shows the Start button (always on phones for Must-dos, on hover otherwise). */
  showStart?: boolean;
  staleLabel?: string;
  onToggleMustDo?: () => void;
  /** TASK-4: shown instead of the next step when a big task has none. */
  onPromptNextStep?: () => void;
  /** Drag handle for reorderable lists. */
  handle?: React.ReactNode;
  swipe?: boolean;
}) {
  const actions = useActions();
  const panel = useTaskPanel();
  const skip = useSkipFlow();
  const focus = useFocus();
  const todayDay = useToday();
  const focusing = focus.active?.taskId === task.id;
  const done = task.status === "done";
  const overdue = isOpen(task) && task.dueDate != null && task.dueDate < todayDay;
  const code = taskCode(task);

  const row = (
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
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          panel.requestDelete(task);
        }
        if (done) return;
        if (e.key === "f" && !task.parentTaskId) void focus.start(task);
        if (e.key === "s") skip.open(task);
      }}
      className={cn(
        "group flex min-h-row cursor-default items-center gap-1 rounded-md pr-2 pl-1 outline-none select-none",
        mustDo && "min-h-16 lg:min-h-12",
        "hover:bg-fill focus-visible:bg-fill focus-visible:ring-2 focus-visible:ring-accent",
        panel.taskId === task.id && "bg-accent-fill",
        className,
      )}
    >
      {handle}
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={done} onChange={(d) => void actions.setTaskDone(task, d)} label={`Complete ${task.title}`} />
      </span>
      <PriorityIcon priority={task.priority} className="hidden lg:block" />
      {code ? (
        <span className="hidden w-14 shrink-0 font-mono text-caption text-label-tertiary lg:inline">{code}</span>
      ) : null}
      <div className="min-w-0 flex-1 py-1.5">
        <p className={cn("truncate", mustDo && "text-headline", done && "text-label-tertiary line-through")}>
          {task.title}
        </p>
        {staleLabel ? (
          <p className="flex items-center gap-1 text-footnote font-medium text-warning-text">
            <AlertTriangle className="size-3.5" strokeWidth={2} aria-hidden /> {staleLabel}
          </p>
        ) : task.nextStep && !done ? (
          <p className="truncate text-footnote text-label-secondary">↳ {task.nextStep}</p>
        ) : onPromptNextStep && !done ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPromptNextStep();
            }}
            className="text-footnote font-medium text-accent-text hover:underline"
          >
            ↳ Add a 2-minute next step
          </button>
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
      {focusing ? (
        // The session for this task is running (maybe minimised, maybe on another device).
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            focus.open();
          }}
          aria-label={`Continue ${task.title}`}
          className="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-footnote font-semibold text-on-accent hover:brightness-95"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" aria-hidden />
          Continue
        </button>
      ) : showStart && !done ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void focus.start(task);
          }}
          aria-label={`Start ${task.title}`}
          className={cn(
            "ml-1 flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text hover:brightness-95",
            mustDo
              ? "flex"
              : "hidden lg:flex lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-visible:opacity-100",
          )}
        >
          <Play className="size-3.5" fill="currentColor" aria-hidden /> Start
        </button>
      ) : null}
      {onToggleMustDo ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMustDo();
          }}
          aria-label={mustDo ? `Remove ${task.title} from Must-dos` : `Make ${task.title} a Must-do`}
          aria-pressed={mustDo}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full hover:bg-fill",
            !mustDo && "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
          )}
        >
          <Star
            className={cn("size-4", mustDo ? "text-warning" : "text-label-tertiary")}
            fill={mustDo ? "currentColor" : "none"}
            strokeWidth={1.75}
          />
        </button>
      ) : null}
    </div>
  );

  const menu = <TaskContextMenu task={task}>{row}</TaskContextMenu>;

  if (!swipe || task.parentTaskId) return menu;
  return (
    <SwipeRow
      done={done}
      onSwipeRight={() => void actions.setTaskDone(task, !done)}
      onSwipeLeft={done ? undefined : () => skip.open(task)}
    >
      {menu}
    </SwipeRow>
  );
}

/** Right-click menu for a task (desktop), used by list rows and board cards. */
export function TaskContextMenu({ task, children }: { task: Task; children: React.ReactNode }) {
  const actions = useActions();
  const panel = useTaskPanel();
  const skip = useSkipFlow();
  const focus = useFocus();
  const done = task.status === "done";
  const isDesktop = useIsDesktop();
  return (
    <ContextMenu
      disabled={!isDesktop}
      items={
        <>
          <ContextMenuItem icon={<PanelRight />} shortcut="↵" onSelect={() => panel.open(task.id)}>
            Open
          </ContextMenuItem>
          {!done && !task.parentTaskId ? (
            <>
              <ContextMenuItem icon={<Play />} shortcut="F" onSelect={() => void focus.start(task)}>
                Start focus
              </ContextMenuItem>
              <ContextMenuItem icon={<CalendarClock />} shortcut="S" onSelect={() => skip.open(task)}>
                Move…
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuItem icon={<Check />} onSelect={() => void actions.setTaskDone(task, !done)}>
            {done ? "Mark not done" : "Mark done"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={<Trash2 />} shortcut="⌫" destructive onSelect={() => panel.requestDelete(task)}>
            Delete task
          </ContextMenuItem>
        </>
      }
    >
      {children}
    </ContextMenu>
  );
}
