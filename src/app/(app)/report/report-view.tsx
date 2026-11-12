"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { SectionLabel } from "@/components/tasks/task-list";
import { currentCycle, cyclePoints } from "@/features/cycles/model";
import {
  useAllTaskEvents,
  useAllTasks,
  useCycles,
  useFocusSessions,
  useHabitLogs,
  useHabits,
  useRituals,
  useSettings,
  useXpEvents,
} from "@/features/data";
import { habitConsistency, weekStartOf } from "@/features/habits/model";
import { accountabilityScore, scoreWord } from "@/features/report/model";
import { buildToday, skipReasonLabel } from "@/features/today/model";
import { useMinuteNow, useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayOf } from "@/lib/dates";

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

/** §8.1 weekly accountability report and §8.3 accountability score: a mirror, not a judge. */
export function ReportView() {
  const settings = useSettings();
  const today = useToday();
  const now = useMinuteNow();
  const tasksQ = useAllTasks();
  const tasks = useMemo(() => tasksQ ?? [], [tasksQ]);
  const rituals = useRituals() ?? [];
  const events = useAllTaskEvents() ?? [];
  const habits = useHabits({ includeArchived: true }) ?? [];
  const logs = useHabitLogs() ?? [];
  const xp = useXpEvents() ?? [];
  const sessions = useFocusSessions() ?? [];
  const cycles = useCycles() ?? [];
  const [offset, setOffset] = useState(0);
  const tz = settings.timezone;

  const weekStart = addDays(weekStartOf(today, settings.weekStartDay), -7 * offset);
  const weekEnd = addDays(weekStart, 6);
  const last = weekEnd < today ? weekEnd : today;
  const inWeek = (ms: number) => {
    const d = dayOf(ms, tz);
    return d >= weekStart && d <= last;
  };
  const firstDay = settings.onboardingCompletedAt ? dayOf(settings.onboardingCompletedAt, tz) : today;

  const stale = useMemo(
    () => buildToday(tasks, { today, now, timezone: tz, capacity: settings.dailyCapacityPts }).stale,
    [tasks, today, now, tz, settings.dailyCapacityPts],
  );
  const score = accountabilityScore({
    today,
    timezone: tz,
    weekStart: settings.weekStartDay,
    firstDay,
    tasks,
    rituals,
    taskEvents: events,
    staleNow: stale.length,
    habits,
    habitLogs: logs,
  });

  const done = tasks.filter(
    (t) => !t.parentTaskId && t.status === "done" && t.completedAt != null && inWeek(t.completedAt),
  );
  const donePts = done.reduce((s, t) => s + (t.effort ?? 0), 0);
  const plans = rituals.filter(
    (r) => r.type === "daily_plan" && r.completedAt && r.date >= weekStart && r.date <= last,
  );
  const shutdowns = rituals.filter(
    (r) => r.type === "daily_shutdown" && r.completedAt && r.date >= weekStart && r.date <= last,
  );
  let mustCommitted = 0;
  let mustKept = 0;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const p of plans) {
    for (const id of (p.data.mustDos as string[] | undefined) ?? []) {
      const t = byId.get(id);
      if (!t || t.status === "cancelled") continue;
      const ok = t.completedAt != null && t.status === "done" && dayOf(t.completedAt, tz) <= p.date;
      if (p.date === today && !ok) continue; // today isn't over yet
      mustCommitted++;
      if (ok) mustKept++;
    }
  }
  const skips = events.filter((e) => e.type === "skip" && inWeek(e.at));
  const reasons = new Map<string, number>();
  for (const s of skips) reasons.set(s.reason ?? "none", (reasons.get(s.reason ?? "none") ?? 0) + 1);
  const xpWeek = xp.filter((e) => inWeek(e.at)).reduce((s, e) => s + e.amount, 0);
  const focusMin = Math.round(sessions.filter((s) => inWeek(s.startedAt)).reduce((s, x) => s + x.actualMinutes, 0));
  const habitRate = habitConsistency(
    habits.filter((h) => h.archivedAt == null),
    logs,
    weekStart,
    last,
    { weekStart: settings.weekStartDay, startDayOf: (h) => dayOf(habits.find((x) => x.id === h.id)!.createdAt, tz) },
  );
  const cycle = currentCycle(cycles, today);
  const cyclePts = cycle ? cyclePoints(tasks, cycle) : null;
  const daysShown = Math.min(
    7,
    Math.max(
      1,
      (new Date(`${last}T00:00:00Z`).getTime() - new Date(`${weekStart}T00:00:00Z`).getTime()) / 86_400_000 + 1,
    ),
  );

  return (
    <>
      <PageHeader
        title="Weekly report"
        subtitle={`${fmt(weekStart)} – ${fmt(weekEnd)}${offset === 0 ? " · this week" : ""}`}
      />
      <PageBody>
        <div className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset(offset + 1)}
            aria-label="Previous week"
            className="grid size-9 place-items-center rounded-full bg-fill hover:bg-fill-strong"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - 1))}
            disabled={offset === 0}
            aria-label="Next week"
            className="grid size-9 place-items-center rounded-full bg-fill hover:bg-fill-strong disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <section
          aria-label="Accountability score"
          className="mb-8 rounded-2xl p-5 text-white"
          style={{ background: "linear-gradient(135deg, var(--band-from), var(--band-to) 60%, #0b3c52)" }}
        >
          <p className="text-footnote font-medium text-white/80">Accountability · last 14 days</p>
          {score.score != null ? (
            <p className="mt-1 flex items-baseline gap-3">
              <span className="text-[56px] leading-none font-bold tabular">{score.score}</span>
              <span className="text-title3">{scoreWord(score.score)}</span>
            </p>
          ) : (
            <p className="mt-2 text-title3">Not enough to go on yet. Plan a day or two first.</p>
          )}
          <ul className="mt-4 flex flex-col gap-2.5">
            {Object.values(score.parts).map((p) => (
              <li key={p.label}>
                <div className="flex justify-between text-footnote">
                  <span className="font-medium">
                    {p.label} <span className="text-white/60">· {Math.round(p.weight * 100)}%</span>
                  </span>
                  <span className="text-white/80 tabular">
                    {p.value == null ? "—" : `${Math.round(p.value * 100)}%`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white" style={{ width: `${(p.value ?? 0) * 100}%` }} />
                </div>
                <p className="mt-0.5 text-caption text-white/70">{p.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Must-dos kept" value={mustCommitted ? `${mustKept} / ${mustCommitted}` : "—"} />
          <Stat label="Tasks done" value={`${done.length}`} sub={donePts ? `${donePts} pts` : undefined} />
          <Stat label="XP earned" value={`${xpWeek >= 0 ? "+" : ""}${xpWeek}`} />
          <Stat label="Daily plans" value={`${plans.length} / ${daysShown}`} />
          <Stat label="Shutdowns" value={`${shutdowns.length} / ${daysShown}`} />
          <Stat
            label="Focus"
            value={focusMin < 60 ? `${focusMin} min` : `${Math.floor(focusMin / 60)} h ${focusMin % 60} m`}
          />
          <Stat label="Habits" value={habitRate == null ? "—" : `${Math.round(habitRate * 100)}%`} sub="of check-ins" />
          <Stat label="Stale now" value={`${stale.length}`} tone={stale.length ? "warning" : undefined} />
          {cyclePts && cycle ? (
            <Stat label={`Cycle ${cycle.number}`} value={`${cyclePts.done} / ${cyclePts.total} pts`} />
          ) : null}
        </div>

        <SectionLabel count={skips.length}>Skips and why</SectionLabel>
        {skips.length ? (
          <ul className="flex flex-col gap-2">
            {[...reasons.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([reason, n]) => (
                <li key={reason} className="flex items-center gap-3">
                  <span className="w-44 shrink-0 truncate text-callout">
                    {reason === "none" ? "No reason" : skipReasonLabel(reason)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-fill">
                    <span
                      className="block h-full rounded-full bg-warning"
                      style={{ width: `${(n / skips.length) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right text-footnote tabular">{n}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-callout text-label-secondary">Nothing was moved this week.</p>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg bg-surface-sunken p-3">
      <p className="text-footnote text-label-secondary">{label}</p>
      <p className={cn("mt-0.5 text-title3 tabular", tone === "warning" && "text-warning-text")}>{value}</p>
      {sub ? <p className="text-caption text-label-tertiary">{sub}</p> : null}
    </div>
  );
}
