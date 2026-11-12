"use client";

import { AlertTriangle, Sun, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { ClearSkyScene } from "@/components/app/scenes";
import { useSkipFlow } from "@/components/skip/skip-flow";
import { SectionLabel, TaskList, useTaskLookups } from "@/components/tasks/task-list";
import { TaskRow } from "@/components/tasks/task-row";
import { Input } from "@/components/ui/input";
import { useActions } from "@/features/actions";
import { useAllTasks, useFocusSessions, useGoals, useSettings } from "@/features/data";
import { needsNextStep, type Goal } from "@/features/goals/model";
import type { Task } from "@/features/tasks/model";
import {
  buildToday,
  MUST_DO_LIMIT,
  needsNextStepPrompt,
  overdueDays,
  staleReason,
  type Capacity,
} from "@/features/today/model";
import { subscribeMinute, useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { longDayLabel } from "@/lib/dates";
import { DayOrbit } from "./day-orbit";
import { SortableTasks } from "./sortable-tasks";
import { NextStepDialog, STALE_ACTIONS, SwapMustDoDialog, useStaleResolver } from "./today-dialogs";

// The clock for stale checks; refreshed each minute and on return to the app (as useToday is).
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

/**
 * Today (PRD §7.7, §8.1): stale tasks that need a decision, up to 3 Must-dos, Also today,
 * goals without a next step, and overdue tasks that each need a decision.
 */
export function TodayView() {
  const actions = useActions();
  const skip = useSkipFlow();
  const all = useAllTasks();
  const focusSessions = useFocusSessions();
  const goals = useGoals();
  const settings = useSettings();
  const todayDay = useToday();
  const now = useSyncExternalStore(subscribeMinute, minuteNow, minuteNow);
  const [title, setTitle] = useState("");
  const [promptFor, setPromptFor] = useState<Task | null>(null);
  const [swapIn, setSwapIn] = useState<Task | null>(null);
  const stale = useStaleResolver();

  const plan = useMemo(
    () =>
      buildToday(all ?? [], {
        today: todayDay,
        now,
        timezone: settings.timezone,
        capacity: settings.dailyCapacityPts,
        focusSessions,
      }),
    [all, focusSessions, todayDay, now, settings.timezone, settings.dailyCapacityPts],
  );
  const stuckGoals = (goals ?? []).filter((g) => needsNextStep(g, all ?? []));

  async function toggleMustDo(t: Task) {
    if (t.mustDoDate === todayDay) return actions.setMustDo(t, todayDay, false);
    if (plan.mustDos.length >= MUST_DO_LIMIT) return setSwapIn(t);
    await actions.setMustDo(t, todayDay, true);
    if (needsNextStepPrompt(t)) setPromptFor(t);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle("");
    await actions.createTask({ title: value, status: "todo", scheduledDate: todayDay });
  }

  const empty =
    all &&
    !plan.stale.length &&
    !plan.mustDos.length &&
    !plan.also.length &&
    !plan.overdue.length &&
    !plan.doneToday.length;

  return (
    <>
      <PageHeader title="Today" subtitle={longDayLabel(todayDay)} />
      <PageBody>
        <DayOrbit plan={plan} now={now} timezone={settings.timezone} ready={all !== undefined} />
        <CapacityBar capacity={plan.capacity} />

        <form onSubmit={add} className="mb-4">
          <label className="sr-only" htmlFor="new-task">
            New task
          </label>
          <Input
            id="new-task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task for today and press Enter"
            autoComplete="off"
            enterKeyHint="done"
          />
        </form>

        {empty ? (
          <EmptyState
            icon={Sun}
            illustration={<ClearSkyScene />}
            title="Nothing planned yet"
            body="Add the first thing you want to get done today, or plan tasks from Upcoming, Tasks and Goals."
          />
        ) : null}

        {plan.stale.length ? (
          <section aria-label="Needs a decision" className="mb-2 rounded-lg border border-warning/30 bg-warning/5 p-2">
            <h2 className="flex items-center gap-2 px-1 pt-1 text-micro text-warning-text uppercase">
              <AlertTriangle className="size-3.5" /> Needs a decision
              <span className="tabular">{plan.stale.length}</span>
            </h2>
            <ul className="flex flex-col">
              {plan.stale.map((t) => (
                <li key={t.id}>
                  <StaleRow
                    task={t}
                    now={now}
                    touchedAt={plan.touched.get(t.id)}
                    onAction={(a) => void stale.run(t, a)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {plan.mustDos.length || plan.also.length ? (
          <>
            <SectionLabel count={plan.mustDos.length ? plan.mustDos.length : undefined}>Must-dos</SectionLabel>
            {plan.mustDos.length ? (
              <SortableTasks
                tasks={plan.mustDos}
                label="Must-dos"
                mustDo
                onToggleMustDo={(t) => void toggleMustDo(t)}
                onPromptNextStep={setPromptFor}
              />
            ) : (
              <p className="rounded-md border border-dashed border-separator px-3 py-3 text-subhead text-label-secondary">
                Star up to {MUST_DO_LIMIT} tasks you must get done today.
              </p>
            )}
          </>
        ) : null}

        {plan.also.length ? (
          <>
            <SectionLabel count={plan.also.length}>Also today</SectionLabel>
            <SortableTasks
              tasks={plan.also}
              label="Also today"
              onToggleMustDo={(t) => void toggleMustDo(t)}
              onPromptNextStep={setPromptFor}
            />
          </>
        ) : null}

        {stuckGoals.length ? <GoalsNeedingStep goals={stuckGoals} /> : null}

        {plan.overdue.length ? (
          <>
            <SectionLabel count={plan.overdue.length}>Overdue · decide on each</SectionLabel>
            <OverdueList
              tasks={plan.overdue}
              todayDay={todayDay}
              onToday={(t) => void actions.planForToday(t, todayDay)}
              onMove={(t) => skip.open(t)}
            />
          </>
        ) : null}

        {plan.doneToday.length ? (
          <>
            <SectionLabel count={plan.doneToday.length}>Done today</SectionLabel>
            <TaskList tasks={plan.doneToday} sort={false} label="Done today" />
          </>
        ) : null}
      </PageBody>

      <NextStepDialog task={promptFor} onClose={() => setPromptFor(null)} />
      <SwapMustDoDialog
        incoming={swapIn}
        mustDos={plan.mustDos}
        onClose={() => setSwapIn(null)}
        onSwap={(out) => {
          const t = swapIn!;
          setSwapIn(null);
          void actions.swapMustDo(out, t, todayDay).then(() => needsNextStepPrompt(t) && setPromptFor(t));
        }}
      />
      {stale.dialog}
    </>
  );
}

/** TODAY-3: planned effort against daily capacity; amber past it. */
function CapacityBar({ capacity: c }: { capacity: Capacity }) {
  if (!c.planned && !c.unestimated) return null;
  const over = c.over > 0;
  const total = Math.max(c.capacity, c.planned);
  return (
    <div className="mb-4" aria-label="Today's capacity">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-footnote text-label-secondary">
        <span>
          <span className={cn("font-semibold tabular", over ? "text-warning-text" : "text-label")}>
            {c.planned} / {c.capacity} pts
          </span>{" "}
          planned
          {c.unestimated ? ` · ${c.unestimated} not estimated` : ""}
        </span>
        {over ? (
          <span className="font-medium text-warning-text">Over by {c.over} — move something</span>
        ) : (
          <span className="tabular">{c.done} pts done</span>
        )}
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-fill">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-warning/40" : "bg-accent/30")}
          style={{ width: `${(c.planned / total) * 100}%` }}
        />
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-warning" : "bg-accent")}
          style={{ width: `${(c.done / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function StaleRow({
  task,
  now,
  touchedAt,
  onAction,
}: {
  task: Task;
  now: number;
  touchedAt?: number;
  onAction: (a: (typeof STALE_ACTIONS)[number]["id"]) => void;
}) {
  const { areaById, goalById, subtasks } = useTaskLookups();
  return (
    <div className="pb-2">
      <TaskRow
        task={task}
        area={task.areaId ? areaById.get(task.areaId) : undefined}
        goal={task.goalId ? goalById.get(task.goalId) : undefined}
        subtaskCount={subtasks.get(task.id)}
        staleLabel={`${staleReason(task, now, touchedAt)}. What's getting in the way?`}
        swipe={false}
      />
      <div className="flex flex-wrap gap-1.5 pr-1 pl-11 lg:pl-9" role="group" aria-label={`Resolve ${task.title}`}>
        {STALE_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAction(a.id)}
            className="h-8 shrink-0 rounded-full bg-surface px-3 text-footnote font-medium shadow-1 hover:bg-fill active:scale-[0.97]"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverdueList({
  tasks,
  todayDay,
  onToday,
  onMove,
}: {
  tasks: Task[];
  todayDay: string;
  onToday: (t: Task) => void;
  onMove: (t: Task) => void;
}) {
  const { areaById, goalById, subtasks } = useTaskLookups();
  return (
    <ul aria-label="Overdue" className="flex flex-col">
      {tasks.map((t) => {
        const days = overdueDays(t, todayDay);
        return (
          <li key={t.id} className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <TaskRow
                task={t}
                area={t.areaId ? areaById.get(t.areaId) : undefined}
                goal={t.goalId ? goalById.get(t.goalId) : undefined}
                subtaskCount={subtasks.get(t.id)}
                staleLabel={t.mustDoDate && t.mustDoDate < todayDay ? "Unfinished Must-do" : undefined}
              />
            </div>
            <span className="hidden w-20 shrink-0 text-right text-footnote text-danger-text tabular sm:inline">
              {days === 1 ? "1 day late" : `${days} days late`}
            </span>
            <button
              type="button"
              onClick={() => onToday(t)}
              aria-label={`Do ${t.title} today`}
              className="h-8 shrink-0 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text hover:brightness-95"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onMove(t)}
              aria-label={`Move ${t.title}`}
              className="h-8 shrink-0 rounded-full bg-fill px-3 text-footnote font-semibold hover:bg-fill-strong"
            >
              Move
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** PRD §8.1: active goals with no open task are surfaced daily until they get a next step. */
function GoalsNeedingStep({ goals }: { goals: Goal[] }) {
  return (
    <>
      <SectionLabel count={goals.length}>Goals without a next step</SectionLabel>
      <ul className="flex flex-col gap-1">
        {goals.map((g) => (
          <GoalStepRow key={g.id} goal={g} />
        ))}
      </ul>
    </>
  );
}

function GoalStepRow({ goal }: { goal: Goal }) {
  const actions = useActions();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  return (
    <li className="rounded-md px-2 py-1.5 hover:bg-fill">
      <div className="flex min-h-9 items-center gap-2">
        <Target className="size-4 shrink-0 text-label-secondary" strokeWidth={1.75} />
        <Link href={`/goal?id=${goal.id}`} className="min-w-0 flex-1 truncate">
          {goal.title}
        </Link>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="h-8 shrink-0 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text"
          >
            Add a next step
          </button>
        ) : null}
      </div>
      {adding ? (
        <form
          className="mt-1 pl-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return setAdding(false);
            void actions.createTask({ title: title.trim(), status: "todo", goalId: goal.id, areaId: goal.areaId });
            setTitle("");
            setAdding(false);
          }}
        >
          <Input
            autoFocus
            aria-label={`Next step for ${goal.title}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setAdding(false)}
            placeholder="The next task for this goal, then Enter"
          />
        </form>
      ) : null}
    </li>
  );
}
