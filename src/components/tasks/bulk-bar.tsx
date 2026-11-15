"use client";

import { CalendarSync, Circle, Gauge, Shapes, Target, Trash2, X } from "lucide-react";
import { useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ChipButton, Picker } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useAreas, useCycles, useGoals } from "@/features/data";
import type { Priority, Task, TaskStatus } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { PRIORITY_OPTIONS, STATUS_OPTIONS, DatePicker } from "./pickers";
import { StatusIcon } from "./icons";

const NONE = "__none__";

/** TASK-7: what you can do to the selected tasks at once. Sits above the tab bar on phones. */
export function BulkBar({ tasks, onDone }: { tasks: Task[]; onDone: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const areas = useAreas() ?? [];
  const goals = (useGoals() ?? []).filter((g) => g.status === "active" || g.status === "planned");
  const cycles = (useCycles() ?? []).filter((c) => c.endDate >= todayDay).slice(0, 3);
  const [confirm, setConfirm] = useState(false);
  const n = tasks.length;
  const noun = `${n} task${n === 1 ? "" : "s"}`;

  const run = async (what: string, fn: () => Promise<unknown>) => {
    await fn();
    toast({ message: `${what} · ${noun}` });
  };

  const chip = (label: string, short: string, icon: React.ReactNode) => (
    <ChipButton aria-label={label} disabled={!n} className="shrink-0">
      {icon}
      <span className="hidden sm:inline">{short}</span>
    </ChipButton>
  );

  return (
    <div
      role="toolbar"
      aria-label="Selected tasks"
      data-bulk-bar
      className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+62px)] z-30 mx-auto flex max-w-[760px] items-center gap-1 overflow-x-auto rounded-xl border border-separator p-1.5 shadow-3 material-popover lg:bottom-6"
    >
      <span className="shrink-0 px-2 text-callout font-semibold tabular" aria-live="polite">
        {n}
        <span className="hidden sm:inline"> selected</span>
      </span>
      <Picker<TaskStatus | typeof NONE>
        label="Set status"
        value={NONE}
        options={STATUS_OPTIONS}
        onChange={(s) => s !== NONE && void run("Status changed", () => actions.bulkUpdateTasks(tasks, { status: s }))}
        trigger={chip("Set status", "Status", <StatusIcon status="todo" />)}
      />
      <Picker<Priority | typeof NONE>
        label="Set priority"
        value={NONE}
        options={PRIORITY_OPTIONS}
        onChange={(p) =>
          p !== NONE && void run("Priority changed", () => actions.bulkUpdateTasks(tasks, { priority: p }))
        }
        trigger={chip("Set priority", "Priority", <Gauge className="size-4 text-label-secondary" strokeWidth={1.75} />)}
      />
      <Picker<string | null>
        label="Move to cycle"
        value={NONE}
        options={[
          { value: null, label: "No cycle", icon: <Circle className="size-4 text-label-tertiary" /> },
          ...cycles.map((c) => ({
            value: c.id,
            label: `Cycle ${c.number}${c.startDate <= todayDay ? " (current)" : ""}`,
          })),
        ]}
        onChange={(id) => void run(id ? "Moved to cycle" : "Taken out of cycle", () => actions.bulkSetCycle(tasks, id))}
        trigger={chip(
          "Move to cycle",
          "Cycle",
          <CalendarSync className="size-4 text-label-secondary" strokeWidth={1.75} />,
        )}
      />
      <span className="shrink-0">
        <DatePicker
          value={null}
          onChange={(d) =>
            void run(d ? "Date set" : "Date cleared", () => actions.bulkUpdateTasks(tasks, { dueDate: d }))
          }
          todayDay={todayDay}
          label="Set due date"
          placeholder="Date"
          compact
        />
      </span>
      <Picker<string | null>
        label="Set area"
        value={NONE}
        options={[
          { value: null, label: "No area", icon: <Circle className="size-4 text-label-tertiary" /> },
          ...areas.map((a) => ({ value: a.id, label: a.name, icon: <AreaIcon icon={a.icon} color={a.color} /> })),
        ]}
        onChange={(id) => void run("Area changed", () => actions.bulkUpdateTasks(tasks, { areaId: id }))}
        trigger={chip("Set area", "Area", <Shapes className="size-4 text-label-secondary" strokeWidth={1.75} />)}
      />
      <Picker<string | null>
        label="Set goal"
        value={NONE}
        options={[
          { value: null, label: "No goal" },
          ...goals.map((g) => ({
            value: g.id,
            label: g.title,
            icon: <Target className="size-4 text-label-secondary" strokeWidth={1.75} />,
          })),
        ]}
        onChange={(id) => void run("Goal changed", () => actions.bulkUpdateTasks(tasks, { goalId: id }))}
        trigger={chip("Set goal", "Goal", <Target className="size-4 text-label-secondary" strokeWidth={1.75} />)}
      />
      <IconButton
        label="Delete selected"
        icon={<Trash2 className="size-4 text-danger-text" />}
        disabled={!n}
        onClick={() => setConfirm(true)}
      />
      <span className="ml-auto shrink-0">
        <Button variant="ghost" aria-label="Done" icon={<X className="size-4" />} onClick={onDone}>
          <span className="hidden sm:inline">Done</span>
        </Button>
      </span>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${noun}?`}
        description="Their subtasks are deleted too."
        confirmLabel={`Delete ${noun}`}
        onConfirm={() => {
          void run("Deleted", () => actions.bulkDeleteTasks(tasks)).then(onDone);
        }}
      />
    </div>
  );
}
