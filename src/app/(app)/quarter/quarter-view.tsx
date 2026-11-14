"use client";

import { ChevronLeft, ChevronRight, Plus, Target, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageBody } from "@/components/app/app-shell";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { useRitualLauncher } from "@/components/rituals/ritual-flow";
import { useRituals } from "@/features/data";
import { Picker } from "@/components/ui/picker";
import { Pill } from "@/components/ui/pill";
import { useActions } from "@/features/actions";
import { useAllTasks, useCycles, useGoals, useVision } from "@/features/data";
import { cyclePoints, cycleState } from "@/features/cycles/model";
import { HEALTH_META } from "@/features/goals/model";
import {
  addQuarters,
  cyclesInQuarter,
  parseQuarterKey,
  quarterDaysLeft,
  quarterKey,
  quarterLabel,
  quarterOf,
  yearTheme,
} from "@/features/quarters/model";
import { useQuarter, type QuarterGoal } from "@/features/quarters/use-quarter";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";

const fmt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" });

/** QTR-1: a quarter's theme, goals with pace, time gone, and the cycles inside it. */
export function QuarterView() {
  const params = useSearchParams();
  const router = useRouter();
  const todayDay = useToday();
  const key = params.get("q");
  const ref = useMemo(() => parseQuarterKey(key) ?? quarterOf(todayDay), [key, todayDay]);
  const quarter = useQuarter(ref);
  const vision = useVision();
  const current = quarterKey(quarterOf(todayDay));
  const go = (n: number) => router.replace(`/quarter?q=${quarterKey(addQuarters(ref, n))}`, { scroll: false });
  if (!quarter) return null;
  const isCurrent = quarterKey(ref) === current;
  const past = quarter.dates.endDate < todayDay;
  const future = quarter.dates.startDate > todayDay;
  const left = quarterDaysLeft(quarter.dates, todayDay);
  const theme = yearTheme(vision, ref.year);

  return (
    <>
      <header className="mx-auto flex w-full max-w-[880px] flex-col gap-1 px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4 lg:px-6 lg:pt-8">
        <div className="flex items-center justify-between gap-2">
          <nav className="flex items-center gap-1 text-footnote text-label-secondary" aria-label="Breadcrumb">
            <Link href={`/year?y=${ref.year}`} className="hover:text-label">
              {ref.year}
              {theme ? ` · ${theme}` : ""}
            </Link>
          </nav>
          <div className="flex items-center gap-1">
            <span className="lg:hidden">
              <SyncIndicator />
            </span>
            {!isCurrent ? (
              <button
                type="button"
                onClick={() => router.replace("/quarter", { scroll: false })}
                className="h-8 rounded-full bg-fill px-3 text-footnote font-semibold text-accent-text"
              >
                This quarter
              </button>
            ) : null}
            <IconButton label="Previous quarter" icon={<ChevronLeft className="size-5" />} onClick={() => go(-1)} />
            <IconButton label="Next quarter" icon={<ChevronRight className="size-5" />} onClick={() => go(1)} />
          </div>
        </div>
        <h1 className="text-display">{quarterLabel(ref)}</h1>
        <p className="text-callout text-label-secondary">
          {fmt(quarter.dates.startDate)} – {fmt(quarter.dates.endDate)}
          {past ? " · ended" : future ? "" : ` · ${left} day${left === 1 ? "" : "s"} left`}
        </p>
        <QuarterRituals quarter={quarter} />
      </header>
      <PageBody>
        <QuarterBody key={quarter.id + (quarter.doc ? "1" : "0")} quarter={quarter} future={future} />
      </PageBody>
    </>
  );
}

function QuarterBody({ quarter, future }: { quarter: NonNullable<ReturnType<typeof useQuarter>>; future: boolean }) {
  const actions = useActions();
  const todayDay = useToday();
  const goals = useGoals() ?? [];
  const cycles = useCycles() ?? [];
  const tasks = useAllTasks() ?? [];
  const [theme, setTheme] = useState(quarter.doc?.theme ?? "");
  const goalIds = quarter.doc?.goalIds ?? [];
  const candidates = goals.filter(
    (g) => !goalIds.includes(g.id) && (g.status === "active" || g.status === "planned" || g.status === "paused"),
  );
  const inQuarter = cyclesInQuarter(cycles, quarter.dates);

  return (
    <div className="flex flex-col">
      <input
        aria-label="Quarter theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        onBlur={() =>
          theme.trim() !== (quarter.doc?.theme ?? "") &&
          void actions.updateQuarter(quarter.ref, { theme: theme.trim() || null })
        }
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        maxLength={200}
        placeholder="What is this quarter about?"
        className="-mt-2 mb-4 w-full rounded-md bg-transparent px-1 py-1 text-title3 outline-none placeholder:text-label-tertiary focus-visible:bg-surface-sunken focus-visible:px-3"
      />

      {!future && quarter.items.length ? (
        <section aria-label="Pace" className="mb-2 flex flex-col gap-2 rounded-lg bg-surface-sunken p-4">
          <Bar label="Time gone" value={quarter.elapsed} tone="var(--label-tertiary)" />
          <Bar label="Progress" value={quarter.progress} tone="var(--accent)" />
          <p className="text-footnote text-label-secondary">
            {quarter.pace === "behind" ? <Pill tone="warning">Behind</Pill> : <Pill tone="success">On pace</Pill>}{" "}
            {quarter.pace === "behind"
              ? "Progress is more than 20 points behind the time gone. Which goal needs a push this cycle?"
              : "Progress is keeping up with the quarter."}
          </p>
        </section>
      ) : null}

      <SectionLabel count={quarter.items.length}>Goals</SectionLabel>
      {quarter.items.length ? (
        <ul aria-label="Quarter goals" className="flex flex-col gap-1">
          {quarter.items.map((i) => (
            <QuarterGoalRow
              key={i.goal.id}
              item={i}
              showPace={!future}
              onRemove={() =>
                void actions.setQuarterGoals(
                  quarter.ref,
                  goalIds.filter((g) => g !== i.goal.id),
                )
              }
            />
          ))}
        </ul>
      ) : (
        <p className="px-1 py-2 text-callout text-label-secondary">
          Pick the 3–5 goals that matter most this quarter. Cycle planning will put them first.
        </p>
      )}
      {goalIds.length < 10 ? (
        candidates.length ? (
          <Picker
            label="Add a goal to the quarter"
            value={null as string | null}
            options={candidates.map((g) => ({
              value: g.id,
              label: g.title,
              icon: <Target className="size-4 text-label-secondary" strokeWidth={1.75} />,
            }))}
            onChange={(id) => id && void actions.setQuarterGoals(quarter.ref, [...goalIds, id])}
            trigger={
              <button
                type="button"
                className="mt-1 flex h-row items-center gap-2 self-start rounded-md px-3 text-body text-label-tertiary hover:bg-fill"
              >
                <Plus className="size-4" /> Add a goal
              </button>
            }
          />
        ) : (
          <Link
            href="/goals?new=1"
            className="mt-1 flex h-row items-center gap-2 self-start rounded-md px-3 text-body text-label-tertiary hover:bg-fill"
          >
            <Plus className="size-4" /> New goal
          </Link>
        )
      ) : null}
      {goalIds.length > 5 ? (
        <p className="px-1 pt-1 text-footnote text-warning-text">
          More than 5 goals in a quarter is a lot. Which could wait for the next one?
        </p>
      ) : null}

      {inQuarter.length ? (
        <>
          <SectionLabel count={inQuarter.length}>Cycles</SectionLabel>
          <ul aria-label="Cycles in the quarter" className="flex flex-col">
            {inQuarter.map((c) => {
              const state = cycleState(c, todayDay);
              const pts = cyclePoints(tasks, c);
              return (
                <li key={c.id}>
                  <Link
                    href={state === "active" ? "/cycle" : `/cycle?tab=review`}
                    className="flex min-h-row items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fill"
                  >
                    <span className="w-20 shrink-0 text-callout font-medium">Cycle {c.number}</span>
                    <span className="min-w-0 flex-1 truncate text-footnote text-label-secondary">
                      {fmt(c.startDate)} – {fmt(c.endDate)}
                      {c.theme ? ` · ${c.theme}` : ""}
                    </span>
                    <span className="shrink-0 text-footnote text-label-secondary tabular">
                      {state === "upcoming" ? "Upcoming" : `${pts.done}/${pts.total} pts`}
                    </span>
                    {state === "active" ? <Pill tone="accent">Now</Pill> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-footnote text-label-secondary">{label}</span>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-fill"
        role="meter"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="w-10 shrink-0 text-right text-footnote font-semibold tabular">{pct}%</span>
    </div>
  );
}

function QuarterGoalRow({ item, showPace, onRemove }: { item: QuarterGoal; showPace: boolean; onRemove: () => void }) {
  const { goal } = item;
  const closed = goal.status === "completed" || goal.status === "dropped";
  const pct = Math.round(item.progress * 100);
  return (
    <li className="group flex items-center gap-2 rounded-md px-2 hover:bg-fill">
      <Link href={`/goal?id=${goal.id}`} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-1.5">
        <Target className="size-4 shrink-0 text-label-secondary" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-body", closed && "text-label-secondary")}>{goal.title}</span>
          <span className="mt-1 flex items-center gap-2">
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-fill sm:w-40" aria-hidden>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-footnote text-label-secondary tabular">{pct}%</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {goal.status === "completed" ? (
            <Pill tone="success">Done</Pill>
          ) : goal.status === "dropped" ? (
            <Pill>Dropped</Pill>
          ) : showPace && item.pace === "behind" ? (
            <Pill tone="warning">Behind</Pill>
          ) : item.health ? (
            <Pill tone={HEALTH_META[item.health].tone}>{HEALTH_META[item.health].label}</Pill>
          ) : null}
        </span>
      </Link>
      <IconButton
        label={`Take ${goal.title} out of the quarter`}
        icon={<X className="size-4" />}
        onClick={onRemove}
        className="opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
      />
    </li>
  );
}

/** QTR-2 / QTR-4: plan the quarter, see the commitment, or review it once it ends. */
function QuarterRituals({ quarter }: { quarter: NonNullable<ReturnType<typeof useQuarter>> }) {
  const launcher = useRitualLauncher();
  const todayDay = useToday();
  const rituals = useRituals() ?? [];
  const { doc, ref, dates } = quarter;
  const label = quarterLabel(ref);
  const left = quarterDaysLeft(dates, todayDay);
  const reviewable = doc?.committedAt && !doc.reviewCompletedAt && dates.endDate <= todayDay;
  const plan = () => void launcher.open("quarterly_plan", { date: dates.startDate, quarter: ref });
  const reviewDone = rituals.find((r) => r.type === "quarterly_review" && r.date === dates.endDate && r.completedAt);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {reviewable ? (
        <Button onClick={() => void launcher.open("quarterly_review", { date: dates.endDate, quarter: ref })}>
          Review {label}
        </Button>
      ) : null}
      {!doc?.committedAt && dates.endDate >= todayDay && left >= 1 ? (
        <Button variant={reviewable ? "secondary" : "primary"} onClick={plan}>
          Plan {label}
        </Button>
      ) : null}
      {doc?.committedAt ? (
        <span className="text-footnote text-label-secondary">
          Committed {new Date(doc.committedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          {doc.reviewCompletedAt || reviewDone ? " · reviewed" : ""}
          {dates.endDate >= todayDay ? (
            <>
              {" · "}
              <button type="button" onClick={plan} className="font-semibold text-accent-text">
                Plan again
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
