"use client";

import { Columns3, LayoutList, Plus } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { useCommands } from "@/components/app/commands";
import { AreaIcon } from "@/components/areas/area-icon";
import { PriorityIcon, StatusIcon } from "@/components/tasks/icons";
import { AreaPicker, GoalPicker } from "@/components/tasks/pickers";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { Picker } from "@/components/ui/picker";
import { Segmented } from "@/components/ui/segmented";
import { useAllTasks, useAreas, useGoals } from "@/features/data";
import { compareTasks, isOpen, PRIORITY_META, STATUS_META, type Task } from "@/features/tasks/model";
import { PRIORITIES, TASK_STATUSES } from "@/lib/sync/entities";
import { Board } from "./board";

type GroupBy = "status" | "priority" | "area" | "goal" | "none";
type View = "list" | "board";

function stored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/** All tasks with list and board views, grouping and filters (PRD VIEW-1, VIEW-2). */
export function TasksView() {
  const all = useAllTasks();
  const areas = useAreas({ includeArchived: true }) ?? [];
  const goals = useGoals() ?? [];
  const { openQuickAdd } = useCommands();
  const [view, setView] = useState<View>(() =>
    typeof window === "undefined" ? "list" : stored("orbit:tasks-view", "list"),
  );
  const [groupBy, setGroupBy] = useState<GroupBy>(() =>
    typeof window === "undefined" ? "status" : stored("orbit:tasks-group", "status"),
  );
  const [areaId, setAreaId] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const tasks = (all ?? []).filter(
    (t) =>
      !t.parentTaskId &&
      t.status !== "inbox" &&
      (showDone || isOpen(t)) &&
      (!areaId || t.areaId === areaId) &&
      (!goalId || t.goalId === goalId),
  );

  const groups: { key: string; label: React.ReactNode; tasks: Task[] }[] = (() => {
    const sorted = [...tasks].sort(compareTasks);
    switch (groupBy) {
      case "status":
        return TASK_STATUSES.filter((s) => s !== "inbox").map((s) => ({
          key: s,
          label: (
            <span className="flex items-center gap-1.5">
              <StatusIcon status={s} className="size-3.5" />
              {STATUS_META[s].label}
            </span>
          ),
          tasks: sorted.filter((t) => t.status === s),
        }));
      case "priority":
        return PRIORITIES.map((p) => ({
          key: p,
          label: (
            <span className="flex items-center gap-1.5">
              <PriorityIcon priority={p} className="size-3.5" />
              {PRIORITY_META[p].label}
            </span>
          ),
          tasks: sorted.filter((t) => t.priority === p),
        }));
      case "area":
        return [
          ...areas.map((a) => ({
            key: a.id,
            label: (
              <span className="flex items-center gap-1.5">
                <AreaIcon icon={a.icon} color={a.color} className="size-3.5" />
                {a.name}
              </span>
            ),
            tasks: sorted.filter((t) => t.areaId === a.id),
          })),
          { key: "none", label: "No area", tasks: sorted.filter((t) => !t.areaId) },
        ];
      case "goal":
        return [
          ...goals.map((g) => ({ key: g.id, label: g.title, tasks: sorted.filter((t) => t.goalId === g.id) })),
          { key: "none", label: "No goal", tasks: sorted.filter((t) => !t.goalId) },
        ];
      default:
        return [{ key: "all", label: "All tasks", tasks: sorted }];
    }
  })().filter((g) => g.tasks.length);

  return (
    <>
      <PageHeader
        title="Tasks"
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={(v) => {
                setView(v);
                store("orbit:tasks-view", v);
              }}
              options={[
                { value: "list", label: "List" },
                { value: "board", label: "Board" },
              ]}
            />
            <IconButton
              label="New task"
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => openQuickAdd({ areaId, goalId, status: "todo" })}
            />
          </>
        }
      />
      <PageBody className={view === "board" ? "max-w-none lg:max-w-[1200px]" : undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-1">
          <AreaPicker value={areaId} onChange={setAreaId} />
          <GoalPicker value={goalId} areaId={areaId} onChange={setGoalId} />
          {view === "list" ? (
            <Picker
              label="Group by"
              value={groupBy}
              onChange={(g) => {
                setGroupBy(g);
                store("orbit:tasks-group", g);
              }}
              options={[
                { value: "status", label: "Status" },
                { value: "priority", label: "Priority" },
                { value: "area", label: "Area" },
                { value: "goal", label: "Goal" },
                { value: "none", label: "No grouping" },
              ]}
              trigger={
                <Button variant="ghost" icon={<LayoutList className="size-4" />}>
                  Group: {groupBy === "none" ? "None" : groupBy[0].toUpperCase() + groupBy.slice(1)}
                </Button>
              }
            />
          ) : (
            <span className="flex items-center gap-1.5 px-2 text-footnote text-label-secondary">
              <Columns3 className="size-4" /> Drag cards between columns
            </span>
          )}
          <label className="ml-auto flex items-center gap-2 px-2 text-footnote text-label-secondary">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Show done
          </label>
        </div>
        {view === "board" ? (
          <Board tasks={tasks} showDone={showDone} />
        ) : (
          groups.map((g) => (
            <section key={g.key}>
              <SectionLabel count={g.tasks.length}>{g.label}</SectionLabel>
              <TaskList tasks={g.tasks} sort={false} />
            </section>
          ))
        )}
        {all && !tasks.length ? (
          <p className="py-10 text-center text-subhead text-label-secondary">No tasks match.</p>
        ) : null}
      </PageBody>
    </>
  );
}
