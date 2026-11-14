"use client";

import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/app/auth-gate";
import { PageBody } from "@/components/app/app-shell";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { AreaIcon } from "@/components/areas/area-icon";
import { SectionLabel } from "@/components/tasks/task-list";
import { IconButton } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { areaColorVar } from "@/features/areas/model";
import {
  useAllTasks,
  useAreas,
  useGoals,
  useKeyResults,
  useMilestones,
  useQuarters,
  useSettings,
  useVision,
  type Area,
} from "@/features/data";
import { goalProgress, type Goal } from "@/features/goals/model";
import { quarterDates, quarterId, quarterKey, quarterLabel, yearTheme } from "@/features/quarters/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayOf, daysBetween } from "@/lib/dates";

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2000, i, 1)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }),
);

/** QTR-5 + GOAL-8: the year's theme, its four quarters, and a roadmap of goals and milestones. */
export function YearView() {
  const params = useSearchParams();
  const router = useRouter();
  const todayDay = useToday();
  const thisYear = Number(todayDay.slice(0, 4));
  const year = Number(params.get("y")) || thisYear;
  const vision = useVision();
  const theme = yearTheme(vision, year);
  const go = (y: number) => router.replace(`/year?y=${y}`, { scroll: false });

  return (
    <>
      <header className="mx-auto flex w-full max-w-[1100px] flex-col gap-1 px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-4 lg:px-6 lg:pt-8">
        <div className="flex items-center justify-between gap-2">
          <Link href="/vision" className="text-footnote text-label-secondary hover:text-label">
            Vision
          </Link>
          <div className="flex items-center gap-1">
            <span className="lg:hidden">
              <SyncIndicator />
            </span>
            {year !== thisYear ? (
              <button
                type="button"
                onClick={() => go(thisYear)}
                className="h-8 rounded-full bg-fill px-3 text-footnote font-semibold text-accent-text"
              >
                This year
              </button>
            ) : null}
            <IconButton label="Previous year" icon={<ChevronLeft className="size-5" />} onClick={() => go(year - 1)} />
            <IconButton label="Next year" icon={<ChevronRight className="size-5" />} onClick={() => go(year + 1)} />
          </div>
        </div>
        <h1 className="text-display">{year}</h1>
        {theme ? (
          <p className="text-title3 text-label-secondary">{theme}</p>
        ) : (
          <Link href="/vision" className="text-callout text-label-tertiary hover:text-label">
            Give {year} a theme on the Vision page
          </Link>
        )}
      </header>
      <PageBody className="max-w-[1100px]">
        <YearBody year={year} />
      </PageBody>
    </>
  );
}

function YearBody({ year }: { year: number }) {
  const user = useCurrentUser();
  const todayDay = useToday();
  const { timezone } = useSettings();
  const quarters = useQuarters() ?? [];
  const goals = useGoals() ?? [];
  const krs = useKeyResults() ?? [];
  const tasks = useAllTasks() ?? [];
  const milestones = useMilestones() ?? [];
  const areas = useAreas({ includeArchived: true }) ?? [];
  const progress = new Map(
    goals.map((g) => [
      g.id,
      goalProgress(
        krs.filter((k) => k.goalId === g.id),
        tasks.filter((t) => t.goalId === g.id),
      ),
    ]),
  );
  const progressOf = (g: Goal) => progress.get(g.id) ?? 0;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const quarterGoalIds = new Set(quarters.filter((q) => q.year === year && !q.deletedAt).flatMap((q) => q.goalIds));
  // Goals whose span touches the year, or that are in one of its quarters.
  const spans = goals
    .map((g) => {
      const start = g.startDate ?? dayOf(g.createdAt, timezone);
      const done = g.completedAt ? dayOf(g.completedAt, timezone) : null;
      const end = g.targetDate ?? done ?? null;
      return { goal: g, start, end };
    })
    .filter(
      ({ goal, start, end }) =>
        quarterGoalIds.has(goal.id) ||
        (goal.status !== "dropped" &&
          start <= yearEnd &&
          (end ?? yearEnd) >= yearStart &&
          (end != null || goal.status === "active")),
    );
  const byArea = new Map<string, typeof spans>();
  for (const s of spans) {
    const key = s.goal.areaId ?? "";
    byArea.set(key, [...(byArea.get(key) ?? []), s]);
  }
  const groups = [...byArea.entries()]
    .map(([areaId, list]) => ({ area: areas.find((a) => a.id === areaId), list }))
    .sort((a, b) => (a.area?.order ?? 999) - (b.area?.order ?? 999));

  return (
    <div className="flex flex-col">
      <section aria-label="Quarters" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((q) => {
          const ref = { year, q };
          const doc = quarters.find((x) => x.id === quarterId(user.id, ref));
          const d = quarterDates(ref);
          const current = d.startDate <= todayDay && todayDay <= d.endDate;
          const items = (doc?.goalIds ?? []).map((id) => goals.find((g) => g.id === id)).filter((g) => g != null);
          return (
            <Link
              key={q}
              href={`/quarter?q=${quarterKey(ref)}`}
              className={cn(
                "flex min-h-36 flex-col gap-2 rounded-lg border bg-surface p-3 shadow-1 transition-colors hover:bg-fill/40",
                current ? "border-accent" : "border-separator",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-headline">{quarterLabel(ref)}</span>
                {current ? <Pill tone="accent">Now</Pill> : null}
                {doc?.reviewCompletedAt ? <Pill tone="success">Reviewed</Pill> : null}
              </span>
              {doc?.theme ? <span className="text-footnote text-label-secondary">{doc.theme}</span> : null}
              {items.length ? (
                <ul className="flex flex-col gap-1">
                  {items.map((g) => (
                    <li key={g.id} className="flex items-center gap-1.5 text-footnote">
                      {g.status === "completed" ? (
                        <Check className="size-3.5 shrink-0 text-success-text" aria-label="Done" />
                      ) : g.status === "dropped" ? (
                        <X className="size-3.5 shrink-0 text-label-tertiary" aria-label="Dropped" />
                      ) : (
                        <span className="w-8 shrink-0 text-label-secondary tabular">
                          {Math.round(progressOf(g) * 100)}%
                        </span>
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          g.status === "dropped" && "text-label-tertiary line-through",
                        )}
                      >
                        {g.title}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-footnote text-label-tertiary">
                  {d.endDate < todayDay ? "Not planned" : "Not planned yet"}
                </span>
              )}
            </Link>
          );
        })}
      </section>

      <SectionLabel count={spans.length}>Goals timeline</SectionLabel>
      {spans.length ? (
        <Timeline year={year} groups={groups} milestones={milestones} progressOf={progressOf} todayDay={todayDay} />
      ) : (
        <p className="px-1 py-2 text-callout text-label-secondary">
          No goals in {year} yet. Give goals a start and target date to see them here.
        </p>
      )}
    </div>
  );
}

function Timeline({
  year,
  groups,
  milestones,
  progressOf,
  todayDay,
}: {
  year: number;
  groups: { area: Area | undefined; list: { goal: Goal; start: string; end: string | null }[] }[];
  milestones: { id: string; goalId: string; title: string; dueDate: string | null; doneAt: number | null }[];
  progressOf: (g: Goal) => number;
  todayDay: string;
}) {
  const start = `${year}-01-01`;
  const days = daysBetween(start, `${year + 1}-01-01`);
  const pos = (d: string) => Math.min(100, Math.max(0, (daysBetween(start, d) / days) * 100));
  const showToday = todayDay.startsWith(String(year));
  return (
    <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0" role="region" aria-label="Goals timeline">
      <div className="min-w-[760px] rounded-lg border border-separator bg-surface">
        {/* months and quarter bands */}
        <div className="grid grid-cols-[180px_1fr] border-b border-separator">
          <span />
          <div className="relative h-8">
            {MONTHS.map((m, i) => (
              <span
                key={m}
                className="absolute top-2 text-caption text-label-tertiary"
                style={{ left: `calc(${pos(`${year}-${String(i + 1).padStart(2, "0")}-01`)}% + 4px)` }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        {groups.map(({ area, list }) => (
          <div key={area?.id ?? "none"} className="border-b border-separator last:border-b-0">
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-micro text-label-secondary uppercase">
              {area ? <AreaIcon icon={area.icon} color={area.color} className="size-3.5" /> : null}
              {area?.name ?? "No area"}
            </div>
            {list.map(({ goal, start: s, end }) => {
              const from = pos(s);
              const to = end ? pos(end) : 100;
              const color = areaColorVar(area?.color);
              const ms = milestones.filter((m) => m.goalId === goal.id && m.dueDate?.startsWith(String(year)));
              const pct = Math.round(progressOf(goal) * 100);
              return (
                <div key={goal.id} className="grid grid-cols-[180px_1fr] items-center">
                  <Link
                    href={`/goal?id=${goal.id}`}
                    className={cn(
                      "truncate px-3 py-1.5 text-footnote hover:underline",
                      goal.status === "dropped" && "text-label-tertiary line-through",
                    )}
                    title={goal.title}
                  >
                    {goal.title}
                  </Link>
                  <div className="relative h-8">
                    {[1, 2, 3].map((q) => (
                      <span
                        key={q}
                        className="absolute inset-y-0 w-px bg-separator/60"
                        style={{ left: `${pos(`${year}-${String(q * 3 + 1).padStart(2, "0")}-01`)}%` }}
                        aria-hidden
                      />
                    ))}
                    <span
                      className="absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full"
                      style={{
                        left: `${from}%`,
                        width: `${Math.max(0.8, to - from)}%`,
                        background: `color-mix(in srgb, ${color} 22%, transparent)`,
                        border: end ? undefined : `1px dashed ${color}`,
                        opacity: goal.status === "dropped" ? 0.4 : 1,
                      }}
                      aria-label={`${goal.title}: ${pct}%`}
                      role="img"
                    >
                      <span className="block h-full" style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
                    </span>
                    {ms.map((m) => (
                      <span
                        key={m.id}
                        title={m.title}
                        aria-label={`Milestone: ${m.title}`}
                        role="img"
                        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-bg"
                        style={{
                          left: `${pos(m.dueDate!)}%`,
                          background: m.doneAt ? color : "var(--surface)",
                          outline: `1.5px solid ${color}`,
                        }}
                      />
                    ))}
                    {showToday ? (
                      <span
                        className="absolute inset-y-0 w-px bg-danger"
                        style={{ left: `${pos(todayDay)}%` }}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
