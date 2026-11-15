"use client";

import { CalendarSync, CheckSquare, Columns3, Gauge, LayoutList, ListFilter, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { useCommands } from "@/components/app/commands";
import { AreaIcon } from "@/components/areas/area-icon";
import { BulkBar } from "@/components/tasks/bulk-bar";
import { PriorityIcon, StatusIcon } from "@/components/tasks/icons";
import { AreaPicker, GoalPicker } from "@/components/tasks/pickers";
import { TaskSelectionProvider } from "@/components/tasks/selection";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { currentCycle } from "@/features/cycles/model";
import { useAllTasks, useAreas, useCycles, useGoals, useSavedViews } from "@/features/data";
import { compareTasks, PRIORITY_META, STATUS_META, type Task } from "@/features/tasks/model";
import {
  DEFAULT_FILTERS,
  filterTasks,
  rangeBetween,
  sameFilters,
  suggestViewName,
  type TaskFilters,
} from "@/features/tasks/views";
import { useToday } from "@/features/use-today";
import { PRIORITIES, TASK_STATUSES } from "@/lib/sync/entities";
import { Board } from "./board";

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

/** Priority filters offered: any, or a band from the top. */
const PRIORITY_FILTERS: { value: string; label: string; set: TaskFilters["priorities"] }[] = [
  { value: "", label: "Any priority", set: [] },
  { value: "urgent", label: "Urgent", set: ["urgent"] },
  { value: "urgent,high", label: "High and above", set: ["urgent", "high"] },
  { value: "urgent,high,medium", label: "Medium and above", set: ["urgent", "high", "medium"] },
  { value: "low,none", label: "Low or none", set: ["low", "none"] },
];
const priorityKey = (p: TaskFilters["priorities"]) => PRIORITIES.filter((x) => p.includes(x)).join(",");

const CYCLE_LABEL: Record<TaskFilters["cycle"], string> = {
  any: "Any cycle",
  current: "This cycle",
  none: "Not in a cycle",
};

/** All tasks with list and board views, grouping, filters (VIEW-1/2), saved views (CMD-4) and bulk actions (TASK-7). */
export function TasksView() {
  const all = useAllTasks();
  const areas = useAreas({ includeArchived: true }) ?? [];
  const goals = useGoals() ?? [];
  const cycles = useCycles();
  const views = useSavedViews();
  const todayDay = useToday();
  const actions = useActions();
  const toast = useToast();
  const router = useRouter();
  const viewId = useSearchParams().get("view");
  const saved = viewId ? views?.find((v) => v.id === viewId) : undefined;
  const { openQuickAdd } = useCommands();

  const [filters, setFilters] = useState<TaskFilters>(() =>
    typeof window === "undefined"
      ? DEFAULT_FILTERS
      : {
          ...DEFAULT_FILTERS,
          view: stored("orbit:tasks-view", "list"),
          groupBy: stored("orbit:tasks-group", "status"),
        },
  );
  // Opening a saved view (or leaving one) loads its filters.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (saved && loadedFor !== saved.id) {
    setLoadedFor(saved.id);
    setFilters({ ...DEFAULT_FILTERS, ...saved.filters });
  } else if (!viewId && loadedFor) {
    setLoadedFor(null);
    setFilters({ ...DEFAULT_FILTERS, view: filters.view, groupBy: filters.groupBy });
  }
  const set = (patch: Partial<TaskFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    if (!saved) {
      if (patch.view) store("orbit:tasks-view", patch.view);
      if (patch.groupBy) store("orbit:tasks-group", patch.groupBy);
    }
  };
  const { areaId, goalId, showDone, groupBy, view } = filters;
  const base = saved ? { ...DEFAULT_FILTERS, ...saved.filters } : { ...DEFAULT_FILTERS, view, groupBy };
  const changed = !sameFilters(filters, base);

  const cycleId = currentCycle(cycles ?? [], todayDay)?.id ?? null;
  const tasks = filterTasks(all ?? [], filters, cycleId);

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

  // ---------------------------------------------------------------- selection (TASK-7)
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const order = groups.flatMap((g) => g.tasks.map((t) => t.id));
  const visible = new Set(order);
  const chosen = tasks.filter((t) => selected.has(t.id) && visible.has(t.id));
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
    setAnchor(null);
  };
  const selection = {
    active: selecting,
    selected,
    toggle: (id: string, shift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shift && anchor) for (const x of rangeBetween(order, anchor, id)) next.add(x);
        else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchor(id);
    },
    start: (id: string) => {
      setSelecting(true);
      setSelected(new Set([id]));
      setAnchor(id);
    },
  };

  // ⌘A selects every task shown; Escape leaves selection.
  const listView = view === "list";
  const orderKey = order.join();
  useEffect(() => {
    if (!listView) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable=true], [role=dialog], [role=menu]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelecting(true);
        setSelected(new Set(orderKey ? orderKey.split(",") : []));
      } else if (e.key === "Escape") {
        setSelecting(false);
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listView, orderKey]);

  // ---------------------------------------------------------------- saving views (CMD-4)
  const [naming, setNaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const suggested = () =>
    suggestViewName(filters, {
      area: areas.find((a) => a.id === areaId)?.name,
      goal: goals.find((g) => g.id === goalId)?.title,
      priorities: PRIORITY_FILTERS.find((p) => p.value === priorityKey(filters.priorities))?.label,
    });

  return (
    <>
      <PageHeader
        title={saved ? saved.name : "Tasks"}
        subtitle={saved ? "Saved view" : undefined}
        actions={
          <>
            {listView ? (
              <Button
                variant="ghost"
                aria-label={selecting ? "Select all" : "Select"}
                icon={<CheckSquare className="size-4" />}
                onClick={() => {
                  setSelecting(true);
                  if (selecting) setSelected(new Set(order));
                }}
              >
                <span className="hidden sm:inline">{selecting ? "Select all" : "Select"}</span>
              </Button>
            ) : null}
            <Segmented
              label="View"
              value={view}
              onChange={(v) => {
                if (v === "board") stop();
                set({ view: v });
              }}
              options={[
                { value: "list", label: "List" },
                { value: "board", label: "Board" },
              ]}
            />
            <IconButton
              label="New task"
              variant="primary"
              className="max-lg:hidden"
              icon={<Plus className="size-4" />}
              onClick={() => openQuickAdd({ areaId, goalId, status: "todo" })}
            />
          </>
        }
      />
      <PageBody className={view === "board" ? "max-w-none lg:max-w-[1200px]" : undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-1">
          <AreaPicker value={areaId} onChange={(id) => set({ areaId: id })} />
          <GoalPicker value={goalId} areaId={areaId} onChange={(id) => set({ goalId: id })} />
          <Picker
            label="Priority filter"
            value={priorityKey(filters.priorities)}
            onChange={(k) => set({ priorities: PRIORITY_FILTERS.find((p) => p.value === k)?.set ?? [] })}
            options={PRIORITY_FILTERS.map((p) => ({ value: p.value, label: p.label }))}
            trigger={
              <Button variant="ghost" icon={<Gauge className="size-4" />}>
                {PRIORITY_FILTERS.find((p) => p.value === priorityKey(filters.priorities))?.label ?? "Priority"}
              </Button>
            }
          />
          <Picker
            label="Cycle filter"
            value={filters.cycle}
            onChange={(c) => set({ cycle: c })}
            options={(["any", "current", "none"] as const).map((c) => ({ value: c, label: CYCLE_LABEL[c] }))}
            trigger={
              <Button variant="ghost" icon={<CalendarSync className="size-4" />}>
                {CYCLE_LABEL[filters.cycle]}
              </Button>
            }
          />
          {view === "list" ? (
            <Picker
              label="Group by"
              value={groupBy}
              onChange={(g) => set({ groupBy: g })}
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
          <label className="flex items-center gap-2 px-2 text-footnote text-label-secondary">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => set({ showDone: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            Show done
          </label>
          <span className="ml-auto flex items-center gap-1">
            {saved && changed ? (
              <Button
                variant="ghost"
                onClick={() => {
                  void actions.updateView(saved.id, { filters });
                  toast({ message: `Updated “${saved.name}”` });
                }}
              >
                Update view
              </Button>
            ) : null}
            {!saved && changed ? (
              <Button variant="ghost" icon={<ListFilter className="size-4" />} onClick={() => setNaming(suggested())}>
                Save view
              </Button>
            ) : null}
            {saved ? (
              <IconButton label="Delete view" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)} />
            ) : null}
          </span>
        </div>
        {view === "board" ? (
          <Board tasks={tasks} showDone={showDone} />
        ) : (
          <TaskSelectionProvider value={selection}>
            {groups.map((g) => (
              <section key={g.key}>
                <SectionLabel count={g.tasks.length}>{g.label}</SectionLabel>
                <TaskList tasks={g.tasks} sort={false} />
              </section>
            ))}
          </TaskSelectionProvider>
        )}
        {all && !tasks.length ? (
          <p className="py-10 text-center text-subhead text-label-secondary">No tasks match.</p>
        ) : null}
        {selecting ? <div className="h-20" aria-hidden /> : null}
      </PageBody>
      {selecting && listView ? <BulkBar tasks={chosen} onDone={stop} /> : null}
      <Dialog
        open={naming != null}
        onOpenChange={(o) => !o && setNaming(null)}
        title="Save view"
        description="It shows in the sidebar and the command palette."
      >
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!naming?.trim()) return;
            const id = await actions.saveView(naming, filters);
            setNaming(null);
            router.replace(`/tasks?view=${id}`);
          }}
        >
          <Input
            aria-label="View name"
            autoFocus
            value={naming ?? ""}
            onChange={(e) => setNaming(e.target.value)}
            maxLength={60}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!naming?.trim()}>
              Save view
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${saved?.name ?? ""}”?`}
        description="Only the view goes; its tasks stay."
        confirmLabel="Delete view"
        onConfirm={() => {
          if (!saved) return;
          void actions.deleteView(saved.id);
          router.replace("/tasks");
        }}
      />
    </>
  );
}
