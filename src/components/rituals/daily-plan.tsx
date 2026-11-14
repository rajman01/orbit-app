"use client";

import { Check, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { useFocus } from "@/components/focus/focus-mode";
import { useSkipFlow } from "@/components/skip/skip-flow";
import { useTaskLookups } from "@/components/tasks/task-list";
import { useActions } from "@/features/actions";
import { areaColorVar } from "@/features/areas/model";
import { currentCycle, missedShutdown } from "@/features/cycles/model";
import { useAllTasks, useCycles, useRituals, useSettings, type RitualDoc } from "@/features/data";
import { isOpen, type Task } from "@/features/tasks/model";
import { buildToday, MUST_DO_LIMIT, overdueDays } from "@/features/today/model";
import { useMinuteNow, useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { BlockMustDo, FreeTimeNote, useDayFit } from "@/components/calendar/free-time";
import { ReachOutRow, useReachOut } from "@/components/people/reach-out";
import { REACH_OUT_PER_DAY } from "@/features/people/model";
import { EmptyStepNote, RitualShell, RitualTaskRow, SmallButton, type RitualStep } from "./ritual-flow";

/**
 * PRD RIT-1: the morning plan. Clear yesterday → process the inbox → choose up to 3 Must-dos →
 * give each a first step → commit, seeing whether they fit the day's free time and blocking time for them
 * (2B.4, CAL-5).
 */
export function DailyPlanFlow({ ritual, onClose }: { ritual: RitualDoc; onClose: () => void }) {
  const actions = useActions();
  const skip = useSkipFlow();
  const focus = useFocus();
  const settings = useSettings();
  const todayDay = useToday();
  const now = useMinuteNow();
  const allTasks = useAllTasks();
  const all = useMemo(() => allTasks ?? [], [allTasks]);
  const rituals = useRituals() ?? [];
  const cycles = useCycles() ?? [];
  const { areaById } = useTaskLookups();
  const color = (t: Task) => (t.areaId ? areaColorVar(areaById.get(t.areaId)?.color) : undefined);
  const strict = settings.strictness !== "gentle";

  const plan = useMemo(
    () =>
      buildToday(all, {
        today: todayDay,
        now,
        timezone: settings.timezone,
        capacity: settings.dailyCapacityPts,
      }),
    [all, now, todayDay, settings.timezone, settings.dailyCapacityPts],
  );
  const cycle = currentCycle(cycles, todayDay);
  const inbox = all.filter((t) => t.status === "inbox" && !t.parentTaskId && t.deletedAt == null);
  const leftover = [...plan.stale, ...plan.overdue];
  const skippedShutdown = missedShutdown(rituals, todayDay);

  // Must-do candidates: today's plan first, then the rest of the cycle.
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const list: Task[] = [];
    const add = (t: Task) => {
      if (!isOpen(t) || seen.has(t.id)) return;
      seen.add(t.id);
      list.push(t);
    };
    for (const t of [...plan.mustDos, ...plan.also]) add(t);
    if (cycle) for (const t of all) if (t.cycleId === cycle.id && !t.parentTaskId) add(t);
    return list;
  }, [plan, cycle, all]);
  const mustDos = plan.mustDos.filter(isOpen);
  const day = useDayFit(todayDay);
  const needSteps = mustDos.filter((t) => !t.nextStep);
  const reach = (useReachOut() ?? []).slice(0, REACH_OUT_PER_DAY);

  const steps: RitualStep[] = [
    {
      id: "yesterday",
      title: leftover.length ? "First, what's left over" : "Yesterday is clear",
      hint: skippedShutdown
        ? "Last night's shutdown didn't happen, so let's close out yesterday here."
        : leftover.length
          ? "Decide on each one: do it today, move it, or tick it off."
          : undefined,
      blockedBy: strict && leftover.length ? `Decide on ${leftover.length} more to continue` : null,
      body: leftover.length ? (
        <ul>
          {leftover.map((t) => {
            const days = overdueDays(t, todayDay);
            return (
              <RitualTaskRow
                key={t.id}
                title={t.title}
                areaColor={color(t)}
                sub={days > 0 ? `${days === 1 ? "1 day" : `${days} days`} late` : "Postponed 3×"}
              >
                <SmallButton
                  tone="accent"
                  onClick={() => void actions.planForToday(t, todayDay)}
                  label={`Do ${t.title} today`}
                >
                  Today
                </SmallButton>
                <SmallButton onClick={() => skip.open(t)} label={`Move ${t.title}`}>
                  Move
                </SmallButton>
                <SmallButton onClick={() => void actions.setTaskDone(t, true)} label={`Mark ${t.title} done`}>
                  <Check className="size-3.5" />
                </SmallButton>
              </RitualTaskRow>
            );
          })}
        </ul>
      ) : (
        <EmptyStepNote>Nothing carried over. A clean start.</EmptyStepNote>
      ),
    },
    {
      id: "inbox",
      title: inbox.length ? `${inbox.length} in your inbox` : "Inbox zero",
      hint: inbox.length ? "Put each one somewhere: today, the cycle, or the backlog." : undefined,
      continueLabel: inbox.length ? "Leave the rest for later" : undefined,
      body: inbox.length ? (
        <ul>
          {inbox.map((t) => (
            <RitualTaskRow key={t.id} title={t.title} areaColor={color(t)}>
              <SmallButton
                tone="accent"
                onClick={() => void actions.planForToday(t, todayDay)}
                label={`Do ${t.title} today`}
              >
                Today
              </SmallButton>
              {cycle ? (
                <SmallButton onClick={() => void actions.addToCycle(t, cycle)} label={`Add ${t.title} to the cycle`}>
                  Cycle
                </SmallButton>
              ) : null}
              <SmallButton
                onClick={() => void actions.updateTask(t, { status: "backlog" })}
                label={`Move ${t.title} to the backlog`}
              >
                Later
              </SmallButton>
            </RitualTaskRow>
          ))}
        </ul>
      ) : (
        <EmptyStepNote>Nothing waiting to be sorted.</EmptyStepNote>
      ),
    },
    {
      id: "must-dos",
      title: "Pick up to 3 Must-dos",
      hint: "If only these got done today, it would be a good day.",
      continueLabel: mustDos.length ? undefined : "Skip for today",
      body: candidates.length ? (
        <>
          <p className="mb-2 text-footnote font-medium text-label-secondary tabular">
            {mustDos.length} of {MUST_DO_LIMIT} chosen
          </p>
          {day ? <FreeTimeNote fit={day.fit} className="mb-2" /> : null}
          <ul>
            {candidates.map((t) => {
              const on = t.mustDoDate === todayDay;
              const full = !on && plan.mustDos.length >= MUST_DO_LIMIT;
              return (
                <RitualTaskRow
                  key={t.id}
                  title={t.title}
                  areaColor={color(t)}
                  sub={t.effort ? `${t.effort} pt${t.effort === 1 ? "" : "s"}` : undefined}
                >
                  <button
                    type="button"
                    disabled={full}
                    aria-pressed={on}
                    aria-label={on ? `Remove ${t.title} from Must-dos` : `Make ${t.title} a Must-do`}
                    onClick={() => void actions.setMustDo(t, todayDay, !on)}
                    className={cn(
                      "grid size-9 place-items-center rounded-full disabled:opacity-30",
                      on ? "bg-warning/15" : "bg-fill hover:bg-fill-strong",
                    )}
                  >
                    <Star
                      className={cn("size-4", on ? "text-warning" : "text-label-tertiary")}
                      fill={on ? "currentColor" : "none"}
                    />
                  </button>
                </RitualTaskRow>
              );
            })}
          </ul>
        </>
      ) : (
        <EmptyStepNote>
          Nothing planned for today or in your cycle yet. Add tasks from Today or the Cycle page.
        </EmptyStepNote>
      ),
    },
    {
      id: "first-steps",
      title: needSteps.length ? "Make each one easy to start" : "Every Must-do has a first step",
      hint: needSteps.length ? "A first step is something you can start in 2 minutes." : undefined,
      body: mustDos.length ? (
        <ul className="flex flex-col gap-3">
          {mustDos.map((t) => (
            <FirstStep key={t.id} task={t} />
          ))}
        </ul>
      ) : (
        <EmptyStepNote>No Must-dos today, so nothing to prepare.</EmptyStepNote>
      ),
    },
    {
      id: "commit",
      title: "Your day",
      hint: `${plan.capacity.planned} of ${plan.capacity.capacity} pts planned${
        plan.capacity.over ? ` — ${plan.capacity.over} over, consider moving something` : ""
      }.`,
      body: (
        <div className="flex flex-col gap-4">
          {day && mustDos.length ? <FreeTimeNote fit={day.fit} /> : null}
          {mustDos.length ? (
            <ul className="flex flex-col gap-2">
              {mustDos.map((t, i) => (
                <li key={t.id} className="flex items-start gap-3 rounded-lg bg-surface-sunken p-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-warning/15 text-footnote font-bold text-warning-text">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-headline">{t.title}</p>
                    {t.nextStep ? <p className="text-footnote text-label-secondary">↳ {t.nextStep}</p> : null}
                    <BlockMustDo task={t} day={todayDay} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyStepNote>No Must-dos today. Everything planned is on Today.</EmptyStepNote>
          )}
          {reach.length ? (
            <section aria-label="Reach out today">
              <p className="mb-1 text-footnote font-medium text-label-secondary">Reach out today</p>
              <ul className="-mx-2 flex flex-col">
                {reach.map((r) => (
                  <ReachOutRow key={r.person.id} item={r} todayDay={todayDay} compact />
                ))}
              </ul>
            </section>
          ) : null}
          {mustDos[0] ? (
            <button
              type="button"
              onClick={() => {
                void actions.completeRitual(ritual.id).then(() => {
                  onClose();
                  void focus.start(mustDos[0], "five");
                });
              }}
              className="text-callout font-semibold text-accent-text hover:underline"
            >
              Commit and start “{mustDos[0].title}” for 5 minutes
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <RitualShell
      ritual={ritual}
      steps={steps}
      onClose={onClose}
      finishLabel="Commit to my day"
      onFinish={() => actions.completeRitual(ritual.id, { mustDos: mustDos.map((t) => t.id) })}
    />
  );
}

function FirstStep({ task }: { task: Task }) {
  const actions = useActions();
  const [value, setValue] = useState(task.nextStep ?? "");
  return (
    <li className="flex flex-col gap-1.5">
      <label className="text-headline" htmlFor={`step-${task.id}`}>
        {task.title}
      </label>
      <input
        id={`step-${task.id}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() =>
          value.trim() !== (task.nextStep ?? "") && void actions.updateTask(task, { nextStep: value.trim() || null })
        }
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="e.g. Open the doc and write the first line"
        className="h-control rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
      />
    </li>
  );
}
