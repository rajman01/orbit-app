"use client";

import { AlertTriangle, Minus, Plus, Search, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { AreaDot } from "@/components/areas/area-icon";
import { EffortPicker } from "@/components/tasks/pickers";
import { useTaskLookups } from "@/components/tasks/task-list";
import { useTaskPanel } from "@/components/tasks/task-panel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { planningCandidates, planningGate, type Cycle } from "@/features/cycles/model";
import { useAllTasks, useCycles, useGoals, useSettings } from "@/features/data";
import { compareTasks, type Task } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";

/**
 * PRD CYC-2: pull work into a cycle, watch the capacity meter, then commit explicitly.
 * Used on the Cycle page and as the last step of the Cycle Review.
 */
export function CyclePlanner({
  cycle,
  onCommitted,
  onReviewPrevious,
  skipGate = false,
}: {
  cycle: Cycle;
  /** Inside the review itself, planning the next cycle is part of the review. */
  skipGate?: boolean;
  onCommitted?: () => void;
  /** Opens the review that blocks planning, if there is one. */
  onReviewPrevious?: () => void;
}) {
  const actions = useActions();
  const toast = useToast();
  const settings = useSettings();
  const todayDay = useToday();
  const allTasks = useAllTasks();
  const all = useMemo(() => allTasks ?? [], [allTasks]);
  const cycles = useCycles() ?? [];
  const goals = (useGoals() ?? []).filter((g) => g.status === "active");
  const { areaById, goalById } = useTaskLookups();
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState(cycle.theme ?? "");
  const [focus, setFocus] = useState<string[]>(cycle.focusGoalIds);
  const [committed, setCommitted] = useState(false);
  const [overCapacityOk, setOverCapacityOk] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const gate = skipGate ? { blocked: false as const } : planningGate(cycles, cycle, todayDay, settings.strictness);
  const inCycle = useMemo(
    () => all.filter((t) => t.cycleId === cycle.id && !t.parentTaskId && t.status !== "cancelled").sort(compareTasks),
    [all, cycle.id],
  );
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return planningCandidates(all, cycle.id)
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .sort(compareTasks);
  }, [all, cycle.id, query]);

  const open = inCycle.filter((t) => t.status !== "done");
  const points = open.reduce((s, t) => s + (t.effort ?? 0), 0);
  const unestimated = open.filter((t) => !t.effort).length;
  const capacity = settings.cycleCapacityPts;
  const over = points > capacity;
  const canCommit = open.length > 0 && committed && (!over || overCapacityOk);

  if (gate.blocked) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <p className="flex items-center gap-2 text-headline">
          <AlertTriangle className="size-4 text-warning" /> Review cycle {gate.cycle.number} first
        </p>
        <p className="mt-1 text-callout text-label-secondary">
          It ended without a review. Deciding what happens to its unfinished work comes before planning the next one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onReviewPrevious ? <Button onClick={onReviewPrevious}>Review cycle {gate.cycle.number}</Button> : null}
        </div>
        {gate.canOverride ? (
          <form
            className="mt-4 flex flex-col gap-2 border-t border-separator pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (overrideReason.trim()) void actions.overridePlanning(cycle, overrideReason);
            }}
          >
            <label className="text-footnote font-medium text-label-secondary" htmlFor="override-reason">
              Or plan anyway — why are you skipping the review?
            </label>
            <div className="flex gap-2">
              <input
                id="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Was travelling, will catch up next week"
                className="h-control min-w-0 flex-1 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
              />
              <Button type="submit" variant="secondary" disabled={!overrideReason.trim()}>
                Plan anyway
              </Button>
            </div>
          </form>
        ) : (
          <p className="mt-3 text-footnote text-label-secondary">Strict mode: the review can&rsquo;t be skipped.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* capacity */}
      <section aria-label="Capacity" className="rounded-lg bg-surface-sunken p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-callout">
            <span className={cn("text-title3 tabular", over && "text-warning-text")}>{points}</span>
            <span className="text-label-secondary tabular"> / {capacity} pts</span>
          </p>
          <p className="text-footnote text-label-secondary">
            {open.length} {open.length === 1 ? "task" : "tasks"}
            {unestimated ? ` · ${unestimated} not estimated` : ""}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-fill">
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", over ? "bg-warning" : "bg-accent")}
            style={{ width: `${Math.min(100, (points / Math.max(1, capacity)) * 100)}%` }}
          />
        </div>
        {over ? (
          <p className="mt-2 text-footnote font-medium text-warning-text">
            {points - capacity} pts over your capacity. Plans that don&rsquo;t fit tend not to happen.
          </p>
        ) : null}
      </section>

      {/* theme and focus goals (CYC-7) */}
      <section className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-label-secondary">What is this cycle about? (optional)</span>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="e.g. Ship the portfolio, start the job hunt"
            className="h-control rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        {goals.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">Focus goals (up to 3)</span>
            <div className="flex flex-wrap gap-2">
              {goals.map((g) => {
                const on = focus.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!on && focus.length >= 3}
                    onClick={() => setFocus(on ? focus.filter((x) => x !== g.id) : [...focus, g.id])}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-medium disabled:opacity-40",
                      on ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
                    )}
                  >
                    <Target className="size-3.5" strokeWidth={1.75} /> {g.title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* in the cycle */}
      <section aria-label={`In cycle ${cycle.number}`}>
        <h3 className="mb-1 px-1 text-micro text-label-secondary uppercase">
          In cycle {cycle.number} <span className="text-label-tertiary tabular">{inCycle.length}</span>
        </h3>
        {inCycle.length ? (
          <ul className="flex flex-col">
            {inCycle.map((t) => (
              <PlanRow
                key={t.id}
                task={t}
                area={t.areaId ? areaById.get(t.areaId)?.color : undefined}
                goal={t.goalId ? goalById.get(t.goalId)?.title : undefined}
                todayDay={todayDay}
                action="remove"
                onAction={() => void actions.removeFromCycle(t)}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-separator px-3 py-3 text-subhead text-label-secondary">
            Add the tasks you want to get done in these {settings.cycleLengthDays} days.
          </p>
        )}
      </section>

      {/* backlog */}
      <section aria-label="Add from your backlog">
        <div className="mb-1 flex items-center justify-between gap-3 px-1">
          <h3 className="text-micro text-label-secondary uppercase">
            Add from your backlog <span className="text-label-tertiary tabular">{candidates.length}</span>
          </h3>
          <label className="flex h-8 items-center gap-1.5 rounded-full bg-fill px-3">
            <Search className="size-3.5 text-label-secondary" aria-hidden />
            <input
              aria-label="Search tasks"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-28 bg-transparent text-footnote outline-none placeholder:text-label-tertiary sm:w-40"
            />
          </label>
        </div>
        {candidates.length ? (
          <ul className="flex max-h-[420px] flex-col overflow-y-auto">
            {candidates.map((t) => (
              <PlanRow
                key={t.id}
                task={t}
                area={t.areaId ? areaById.get(t.areaId)?.color : undefined}
                goal={t.goalId ? goalById.get(t.goalId)?.title : undefined}
                todayDay={todayDay}
                action="add"
                onAction={() => void actions.addToCycle(t, cycle)}
              />
            ))}
          </ul>
        ) : (
          <p className="px-1 py-2 text-subhead text-label-secondary">
            {query ? "No tasks match." : "Nothing left in your backlog. Capture more from the inbox."}
          </p>
        )}
      </section>

      {/* commitment (§8.1) */}
      <section aria-label="Commit" className="flex flex-col gap-3 rounded-lg border border-separator p-4">
        {cycle.committedAt ? (
          <p className="text-footnote text-label-secondary">
            You committed to {cycle.committedTaskIds.length} tasks ({cycle.committedPts} pts) on{" "}
            {new Date(cycle.committedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}. Committing
            again replaces it.
          </p>
        ) : null}
        <label className="flex items-start gap-3 text-callout">
          <input
            type="checkbox"
            checked={committed}
            onChange={(e) => setCommitted(e.target.checked)}
            disabled={!open.length}
            className="mt-0.5 size-5 accent-[var(--accent)]"
          />
          <span>
            I commit to these <strong className="font-semibold">{open.length} tasks</strong> ({points} pts) for cycle{" "}
            {cycle.number}.
          </span>
        </label>
        {over ? (
          <label className="flex items-start gap-3 text-callout text-warning-text">
            <input
              type="checkbox"
              checked={overCapacityOk}
              onChange={(e) => setOverCapacityOk(e.target.checked)}
              className="mt-0.5 size-5 accent-[var(--warning)]"
            />
            <span>I know this is over my capacity.</span>
          </label>
        ) : null}
        <Button
          size="large"
          disabled={!canCommit}
          onClick={() => {
            void actions
              .commitCycle(cycle, {
                taskIds: open.map((t) => t.id),
                points,
                theme,
                focusGoalIds: focus,
              })
              .then(() => {
                toast({ message: `Committed to cycle ${cycle.number}` });
                setCommitted(false);
                onCommitted?.();
              });
          }}
        >
          Commit to cycle {cycle.number}
        </Button>
      </section>
    </div>
  );
}

function PlanRow({
  task,
  area,
  goal,
  todayDay,
  action,
  onAction,
}: {
  task: Task;
  area?: string;
  goal?: string;
  todayDay: string;
  action: "add" | "remove";
  onAction: () => void;
}) {
  const actions = useActions();
  const panel = useTaskPanel();
  const done = task.status === "done";
  return (
    <li className="group flex min-h-row items-center gap-2 rounded-md px-1 hover:bg-fill">
      <button
        type="button"
        onClick={onAction}
        aria-label={action === "add" ? `Add ${task.title} to the cycle` : `Remove ${task.title} from the cycle`}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          action === "add" ? "bg-accent-fill text-accent-text" : "bg-fill text-label-secondary",
        )}
      >
        {action === "add" ? <Plus className="size-4" /> : <Minus className="size-4" />}
      </button>
      <button
        type="button"
        onClick={() => panel.open(task.id)}
        className={cn("min-w-0 flex-1 truncate text-left", done && "text-label-tertiary line-through")}
      >
        {task.title}
        {goal ? <span className="ml-2 hidden text-footnote text-label-tertiary sm:inline">{goal}</span> : null}
      </button>
      {task.dueDate ? (
        <span className="hidden text-footnote text-label-secondary sm:inline">{dayLabel(task.dueDate, todayDay)}</span>
      ) : null}
      {area ? <AreaDot color={area} /> : null}
      <EffortPicker value={task.effort} onChange={(e) => void actions.updateTask(task, { effort: e })} />
    </li>
  );
}
