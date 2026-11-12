"use client";

import { CalendarSync, CheckCircle2, Target } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { BurnUp } from "@/components/cycles/burn-up";
import { CyclePlanner } from "@/components/cycles/planner";
import { useRitualLauncher } from "@/components/rituals/ritual-flow";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  burnUp,
  currentCycle,
  cyclePoints,
  cycleState,
  dayOfCycle,
  daysLeft,
  planningTarget,
  type Cycle,
} from "@/features/cycles/model";
import { useAllTasks, useCycleAddedAt, useCycles, useGoals, useSettings } from "@/features/data";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";

type Tab = "now" | "plan" | "review";

const fmt = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** The Cycle page (PRD §7.6): the active cycle, planning, and review. */
export function CycleView() {
  const router = useRouter();
  const params = useSearchParams();
  const todayDay = useToday();
  const cycles = useCycles();
  const ritual = useRitualLauncher();
  const current = cycles ? currentCycle(cycles, todayDay) : undefined;
  const target = cycles ? planningTarget(cycles, todayDay) : undefined;
  // The oldest cycle still waiting for its review (the review is due on its last day).
  const toReview = (cycles ?? [])
    .filter((c) => cycleState(c, todayDay) === "review")
    .sort((a, b) => a.number - b.number)[0];
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested ?? (toReview ? "review" : current && !current.committedAt ? "plan" : "now");
  const setTab = (t: Tab) => router.replace(t === "now" ? "/cycle" : `/cycle?tab=${t}`, { scroll: false });

  if (cycles && !current) {
    return (
      <>
        <PageHeader title="Cycle" />
        <EmptyState
          icon={CalendarSync}
          title="Setting up your first cycle"
          body="This takes a moment after your first sync."
        />
      </>
    );
  }
  if (!cycles || !current) return <PageHeader title="Cycle" />;

  return (
    <>
      <PageHeader
        title={`Cycle ${current.number}`}
        subtitle={`${fmt(current.startDate)} – ${fmt(current.endDate)} · day ${dayOfCycle(current, todayDay)} of ${dayOfCycle(
          current,
          current.endDate,
        )}`}
      />
      <PageBody>
        <div className="mb-6">
          <Segmented
            label="Cycle view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "now", label: "This cycle" },
              { value: "plan", label: target && target.id !== current.id ? `Plan cycle ${target.number}` : "Plan" },
              { value: "review", label: toReview ? "Review ·" : "Review" },
            ]}
          />
        </div>
        {tab === "now" ? <NowTab cycle={current} onPlan={() => setTab("plan")} /> : null}
        {tab === "plan" ? (
          target ? (
            <CyclePlanner
              key={target.id}
              cycle={target}
              onCommitted={() => setTab("now")}
              onReviewPrevious={() => {
                const prev = cycles.find((c) => c.number === target.number - 1);
                if (prev) void ritual.open("cycle_review", { cycle: prev });
              }}
            />
          ) : (
            <p className="text-callout text-label-secondary">The next cycle is being set up.</p>
          )
        ) : null}
        {tab === "review" ? <ReviewTab cycles={cycles} toReview={toReview} /> : null}
      </PageBody>
    </>
  );
}

function NowTab({ cycle, onPlan }: { cycle: Cycle; onPlan: () => void }) {
  const todayDay = useToday();
  const settings = useSettings();
  const all = useAllTasks();
  const goals = useGoals() ?? [];
  const addedAt = useCycleAddedAt(cycle.id);
  const pts = useMemo(() => cyclePoints(all ?? [], cycle), [all, cycle]);
  const points = useMemo(
    () => burnUp(all ?? [], cycle, addedAt ?? new Map(), todayDay, settings.timezone),
    [all, cycle, addedAt, todayDay, settings.timezone],
  );
  const inCycle = (all ?? []).filter((t) => t.cycleId === cycle.id && !t.parentTaskId && t.status !== "cancelled");
  const committedIds = new Set(cycle.committedTaskIds);
  const committed = inCycle.filter((t) => committedIds.has(t.id));
  const added = inCycle.filter((t) => !committedIds.has(t.id));
  const focus = goals.filter((g) => cycle.focusGoalIds.includes(g.id));
  const pct = pts.total ? Math.round((pts.done / pts.total) * 100) : 0;
  const left = daysLeft(cycle, todayDay);

  if (!cycle.committedAt && !inCycle.length) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-surface-sunken px-6 py-10 text-center">
        <CalendarSync className="size-8 text-label-tertiary" strokeWidth={1.5} />
        <div>
          <p className="text-title3">Plan this cycle</p>
          <p className="mt-1 text-subhead text-label-secondary">
            Choose what you&rsquo;ll get done by {dayLabel(cycle.endDate, todayDay)}, then commit to it.
          </p>
        </div>
        <Button onClick={onPlan}>Plan cycle {cycle.number}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {cycle.theme || focus.length ? (
        <section className="flex flex-col gap-2">
          {cycle.theme ? <p className="text-title3">{cycle.theme}</p> : null}
          {focus.length ? (
            <div className="flex flex-wrap gap-2">
              {focus.map((g) => (
                <span
                  key={g.id}
                  className="flex h-7 items-center gap-1.5 rounded-full bg-accent-fill px-3 text-footnote font-medium text-accent-text"
                >
                  <Target className="size-3.5" strokeWidth={1.75} /> {g.title}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Progress">
        <div className="flex items-baseline justify-between">
          <p>
            <span className="text-title1 tabular">{pct}%</span>
            <span className="ml-2 text-callout text-label-secondary tabular">
              {pts.done} of {pts.total} pts
            </span>
          </p>
          <p className="text-callout text-label-secondary">{left === 1 ? "Last day" : `${left} days left`}</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-fill">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Tile label="Committed" value={`${pts.committed} pts`} />
          <Tile label="Added since" value={`${pts.added} pts`} tone={pts.added ? "warning" : undefined} />
          <Tile label="Tasks done" value={`${pts.doneTasks}/${pts.tasks}`} />
        </div>
      </section>

      <section aria-label="Burn-up" className="rounded-xl border border-separator p-4">
        <BurnUp points={points} today={todayDay} />
      </section>

      {!cycle.committedAt ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="text-callout">This cycle has tasks but no commitment yet.</p>
          <Button variant="secondary" onClick={onPlan}>
            Commit
          </Button>
        </div>
      ) : null}

      {committed.length ? (
        <div>
          <SectionLabel count={committed.length}>Committed</SectionLabel>
          <TaskList tasks={committed} label="Committed" />
        </div>
      ) : null}
      {added.length ? (
        <div>
          <SectionLabel count={added.length}>Added mid-cycle</SectionLabel>
          <TaskList tasks={added} label="Added mid-cycle" />
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-2 py-3">
      <p className={cn("text-headline tabular", tone === "warning" && "text-warning-text")}>{value}</p>
      <p className="text-footnote text-label-secondary">{label}</p>
    </div>
  );
}

function ReviewTab({ cycles, toReview }: { cycles: Cycle[]; toReview?: Cycle }) {
  const todayDay = useToday();
  const ritual = useRitualLauncher();
  const all = useAllTasks() ?? [];
  const past = cycles.filter((c) => c.reviewCompletedAt).sort((a, b) => b.number - a.number);
  const current = currentCycle(cycles, todayDay);

  return (
    <div className="flex flex-col gap-6">
      {toReview ? (
        <div className="flex flex-col gap-3 rounded-xl bg-[linear-gradient(135deg,var(--band-from),var(--band-to))] p-5 text-white">
          <p className="text-footnote font-medium text-white/80">About 20 minutes</p>
          <p className="text-title2">Review cycle {toReview.number}</p>
          <p className="text-callout text-white/85">
            Decide on what&rsquo;s unfinished, check in on your goals, and plan the next cycle.
          </p>
          <button
            type="button"
            onClick={() => void ritual.open("cycle_review", { cycle: toReview })}
            className="mt-1 h-11 self-start rounded-full bg-white px-5 font-semibold text-[var(--accent-on-white)]"
          >
            Start the review
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-surface-sunken px-4 py-4 text-callout text-label-secondary">
          {current
            ? `The review for cycle ${current.number} opens on its last day, ${fmt(current.endDate)}.`
            : "No review due."}
        </p>
      )}

      {past.length ? (
        <section>
          <SectionLabel count={past.length}>Past cycles</SectionLabel>
          <ul className="flex flex-col gap-2">
            {past.map((c) => {
              const pts = cyclePoints(all, c);
              const pct = pts.total ? Math.round((pts.done / pts.total) * 100) : 0;
              return (
                <li key={c.id} className="rounded-lg border border-separator p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                      <p className="text-headline">
                        Cycle {c.number}
                        {c.theme ? <span className="font-normal text-label-secondary"> · {c.theme}</span> : null}
                      </p>
                      <p className="text-footnote text-label-secondary">
                        {fmt(c.startDate)} – {fmt(c.endDate)} · {pts.done} of {pts.total} pts
                      </p>
                    </div>
                    <span className="text-headline tabular">{pct}%</span>
                  </div>
                  {c.reflection ? (
                    <p className="mt-2 text-footnote whitespace-pre-line text-label-secondary">{c.reflection}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
