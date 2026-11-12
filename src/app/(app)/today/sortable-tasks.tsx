"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useTaskLookups } from "@/components/tasks/task-list";
import { TaskRow } from "@/components/tasks/task-row";
import { useActions } from "@/features/actions";
import type { Task } from "@/features/tasks/model";
import { needsNextStepPrompt, orderBetween } from "@/features/today/model";
import { cn } from "@/lib/cn";

/**
 * TODAY-5: drag to reorder; the order is the priority. Desktop drags by the handle,
 * phones long-press the row (DESIGN.md §8). A drop writes only the moved task's order.
 */
export function SortableTasks({
  tasks,
  label,
  mustDo = false,
  onToggleMustDo,
  onPromptNextStep,
}: {
  tasks: Task[];
  label: string;
  mustDo?: boolean;
  onToggleMustDo: (t: Task) => void;
  onPromptNextStep: (t: Task) => void;
}) {
  const actions = useActions();
  const { areaById, goalById, subtasks } = useTaskLookups();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = tasks.findIndex((t) => t.id === active.id);
    const to = tasks.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    const rest = tasks.filter((t) => t.id !== active.id);
    const before = rest[to - 1]?.order;
    const after = rest[to]?.order;
    void actions.setTaskOrder(tasks[from], orderBetween(before, after));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={label} className="flex flex-col">
          {tasks.map((t) => (
            <SortableRow key={t.id} id={t.id}>
              {(handle) => (
                <TaskRow
                  task={t}
                  area={t.areaId ? areaById.get(t.areaId) : undefined}
                  goal={t.goalId ? goalById.get(t.goalId) : undefined}
                  subtaskCount={subtasks.get(t.id)}
                  mustDo={mustDo}
                  showStart
                  handle={handle}
                  onToggleMustDo={() => onToggleMustDo(t)}
                  onPromptNextStep={needsNextStepPrompt(t) ? () => onPromptNextStep(t) : undefined}
                />
              )}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const { onTouchStart, ...handleListeners } = listeners ?? {};
  return (
    <li
      ref={setNodeRef}
      onTouchStart={onTouchStart as React.TouchEventHandler<HTMLLIElement> | undefined}
      style={{ transform: CSS.Translate.toString(transform), transition, WebkitTouchCallout: "none" }}
      className={cn("relative rounded-md", isDragging && "z-10 scale-[1.02] bg-surface-raised shadow-2")}
    >
      {children(
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label="Reorder"
          {...attributes}
          {...handleListeners}
          onClick={(e) => e.stopPropagation()}
          className="-ml-1 hidden h-8 w-4 shrink-0 cursor-grab place-items-center rounded-sm text-label-tertiary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing lg:grid"
        >
          <GripVertical className="size-4" />
        </button>,
      )}
    </li>
  );
}
