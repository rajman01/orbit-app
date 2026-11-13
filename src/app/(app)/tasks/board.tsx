"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { createPortal } from "react-dom";
import { AreaDot } from "@/components/areas/area-icon";
import { PriorityIcon, StatusIcon } from "@/components/tasks/icons";
import { useTaskLookups } from "@/components/tasks/task-list";
import { TaskContextMenu } from "@/components/tasks/task-row";
import { useTaskPanel } from "@/components/tasks/task-panel";
import { useActions } from "@/features/actions";
import { compareTasks, STATUS_META, taskCode, type Task, type TaskStatus } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";

const COLUMNS: TaskStatus[] = ["backlog", "todo", "in_progress", "done"];

/** Kanban by status (PRD VIEW-2). Drag with mouse, long-press on touch, or keyboard (Space, arrows, Space). */
export function Board({ tasks, showDone }: { tasks: Task[]; showDone: boolean }) {
  const actions = useActions();
  const [dragging, setDragging] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const columns = COLUMNS.filter((c) => showDone || c !== "done");

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const status = e.over?.id as TaskStatus | undefined;
    if (task && status && status !== task.status) void actions.updateTask(task, { status });
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:snap-none lg:overflow-visible lg:px-0"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((status) => (
          <Column key={status} status={status} tasks={tasks.filter((t) => t.status === status).sort(compareTasks)} />
        ))}
      </div>
      {/* Rendered at the top of the page, so no transformed ancestor can offset it from the pointer. */}
      {typeof document !== "undefined"
        ? createPortal(
            <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }}>
              {dragging ? <Card task={dragging} lifted /> : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}

function Column({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_META[status].label}
      className={cn(
        "flex w-[78vw] max-w-80 shrink-0 snap-start flex-col gap-2 rounded-lg bg-surface-sunken p-2 transition-colors lg:w-auto lg:max-w-none",
        isOver && "bg-accent-fill",
      )}
    >
      <h2 className="flex items-center gap-2 px-1 pt-1 text-footnote font-semibold">
        <StatusIcon status={status} className="size-3.5" />
        {STATUS_META[status].label}
        <span className="font-normal text-label-tertiary tabular">{tasks.length}</span>
      </h2>
      {tasks.map((t) => (
        <DraggableCard key={t.id} task={t} />
      ))}
      {!tasks.length ? (
        <p className="px-1 py-6 text-center text-footnote text-label-tertiary">Drop tasks here</p>
      ) : null}
    </section>
  );
}

function DraggableCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <TaskContextMenu task={task}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={cn("touch-manipulation outline-none", isDragging && "opacity-30")}
      >
        <Card task={task} />
      </div>
    </TaskContextMenu>
  );
}

function Card({ task, lifted }: { task: Task; lifted?: boolean }) {
  const { areaById, goalById } = useTaskLookups();
  const panel = useTaskPanel();
  const todayDay = useToday();
  const area = task.areaId ? areaById.get(task.areaId) : undefined;
  const goal = task.goalId ? goalById.get(task.goalId) : undefined;
  return (
    <button
      type="button"
      data-task-row={task.id}
      aria-label={`Open ${task.title}`}
      onClick={() => panel.open(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          panel.requestDelete(task);
        }
      }}
      className={cn(
        "flex w-full flex-col gap-2 rounded-md border border-separator bg-surface p-3 text-left shadow-1 dark:bg-surface-raised",
        lifted && "scale-[1.02] shadow-2",
      )}
    >
      <span className="flex items-center gap-1.5 text-caption text-label-tertiary">
        <PriorityIcon priority={task.priority} className="size-3.5" />
        <span className="font-mono">{taskCode(task)}</span>
        {area ? <AreaDot color={area.color} className="ml-auto" /> : null}
      </span>
      <span className={cn("text-body", task.status === "done" && "text-label-tertiary line-through")}>
        {task.title}
      </span>
      {goal || task.dueDate ? (
        <span className="flex items-center justify-between gap-2 text-footnote text-label-secondary">
          <span className="truncate">{goal?.title}</span>
          {task.dueDate ? <span className="shrink-0 tabular">{dayLabel(task.dueDate, todayDay)}</span> : null}
        </span>
      ) : null}
    </button>
  );
}
