"use client";

import { Gauge } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { AreaIcon } from "@/components/areas/area-icon";
import { HEALTH_LABEL, HealthDot, useAreaHealths } from "@/components/areas/area-health";
import { BarChart, HBars, Meter, Radar } from "@/components/insights/charts";
import { WheelRatingDialog } from "@/components/insights/wheel-rating";
import { MoneyInsights } from "@/components/money/money-insights";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { areaColorVar } from "@/features/areas/model";
import {
  useAllTaskEvents,
  useAllTasks,
  useAreaRatings,
  useAreas,
  useCycles,
  useFocusSessions,
  useGoals,
  useJournal,
  useRituals,
  useSettings,
  useXpEvents,
} from "@/features/data";
import {
  cycleTrend,
  doneByArea,
  focusByWeek,
  headlines,
  insightRange,
  moodVsDone,
  postponementsBeforeDone,
  ritualConsistency,
  skipInsights,
  staleTrend,
  timeVsValues,
  xpByWeek,
} from "@/features/insights/model";
import { ENERGY, MOOD } from "@/features/journal/model";
import { skipReasonLabel } from "@/features/today/model";
import { useToday } from "@/features/use-today";
import { levelFromXp, totalXp } from "@/features/xp/model";
import { dayLabel, type Day } from "@/lib/dates";

const RANGES = [4, 8, 13] as const;
type RangeN = (typeof RANGES)[number];

function storedRange(): RangeN {
  try {
    const v = Number(localStorage.getItem("orbit:insights-range"));
    return (RANGES as readonly number[]).includes(v) ? (v as RangeN) : 4;
  } catch {
    return 4;
  }
}

const shortDay = (d: Day) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    Date.parse(`${d}T12:00:00Z`),
  );
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** INS-1–4, AREA-3/4: what's actually happening. Worked out on the device; works offline. */
export function InsightsView() {
  const settings = useSettings();
  const today = useToday();
  const tasks = useAllTasks();
  const events = useAllTaskEvents();
  const sessions = useFocusSessions();
  const rituals = useRituals();
  const cycles = useCycles();
  const xp = useXpEvents();
  const journal = useJournal();
  const areas = useAreas() ?? [];
  const goals = useGoals() ?? [];
  const ratings = useAreaRatings();
  const healths = useAreaHealths(areas.map((a) => a.id));
  const [n, setN] = useState<RangeN>(() => (typeof window === "undefined" ? 4 : storedRange()));
  const [rating, setRating] = useState(false);

  const ready = tasks && events && sessions && rituals && cycles && xp && journal && ratings;
  const tz = settings.timezone;
  const ws = settings.weekStartDay;
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const areaName = (id: string | null) => (id ? (areaById.get(id)?.name ?? "Archived area") : "No area");
  const goalName = (id: string) => goals.find((g) => g.id === id)?.title ?? "A goal";

  if (!ready)
    return (
      <>
        <PageHeader title="Insights" />
        <PageBody>{null}</PageBody>
      </>
    );

  const r = insightRange(cycles, today, n);
  const trend = cycleTrend(r, tasks, sessions, xp, tz, today);
  const focus = focusByWeek(sessions, r, tz, ws);
  const byArea = doneByArea(tasks, r, tz);
  const rit = ritualConsistency(rituals, r, today);
  const xpWeeks = xpByWeek(xp, r, tz, ws);
  const level = levelFromXp(totalXp(xp));
  const skips = skipInsights(events, tasks, r, tz);
  const postponed = postponementsBeforeDone(tasks, r, tz);
  const stale = staleTrend(tasks, events, r, tz, ws);
  const latest = ratings[0];
  const previous = ratings[1];
  const values = timeVsValues(sessions, tasks, latest, r, tz);
  const mood = moodVsDone(journal, tasks, sessions, r, tz);
  const lines = headlines({ trend, skips, reasonLabel: (id) => skipReasonLabel(id) ?? id, areaName });
  const pastCycles = trend.filter((c) => !c.current).length;

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle={`${shortDay(r.from)} – today · ${r.cycles.length} cycle${r.cycles.length === 1 ? "" : "s"}`}
      />
      <PageBody className="max-w-[760px]">
        <div className="mb-3 flex justify-end">
          <Segmented
            label="Range"
            value={String(n) as `${RangeN}`}
            onChange={(v) => {
              const next = Number(v) as RangeN;
              setN(next);
              try {
                localStorage.setItem("orbit:insights-range", String(next));
              } catch {}
            }}
            options={RANGES.map((k) => ({ value: String(k) as `${RangeN}`, label: `${k} cycles` }))}
          />
        </div>
        {lines.length || pastCycles < 4 ? (
          <div className="mb-2 rounded-xl bg-accent-fill p-4 text-callout">
            {lines.map((l) => (
              <p key={l} className="text-accent-text">
                {l}
              </p>
            ))}
            {pastCycles < 4 ? (
              <p className="text-label-secondary">
                {pastCycles === 0
                  ? "Your first cycle is still running. "
                  : `${pastCycles} finished cycle${pastCycles === 1 ? "" : "s"} so far. `}
                Trends get more reliable after four.
              </p>
            ) : null}
          </div>
        ) : null}

        <SectionLabel>Cycles</SectionLabel>
        <Card
          title="Plan finished per cycle"
          note="Points done of points planned (and added). The current cycle is shown lighter."
        >
          <BarChart
            label="Plan finished per cycle"
            max={100}
            bars={trend.map((c) => ({
              key: String(c.number),
              label: `C${c.number}`,
              value: Math.round(c.completion * 100),
              display: `${Math.round(c.completion * 100)}%`,
              partial: c.current,
              highlight: !c.current && c === trend.filter((x) => !x.current).at(-1),
            }))}
          />
        </Card>
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Focus hours per week">
            <BarChart
              label="Focus hours per week"
              unit="h"
              bars={focus.map((w, i) => ({
                key: w.week,
                label: shortDay(w.week),
                value: w.hours,
                partial: i === focus.length - 1,
                highlight: i === focus.length - 2,
              }))}
            />
          </Card>
          <Card
            title="XP per week"
            note={`Level ${level.level} · ${level.title} · ${totalXp(xp).toLocaleString()} XP in all`}
          >
            <BarChart
              label="XP per week"
              bars={xpWeeks.map((w, i) => ({
                key: w.week,
                label: shortDay(w.week),
                value: Math.max(0, w.xp),
                partial: i === xpWeeks.length - 1,
                highlight: i === xpWeeks.length - 2,
              }))}
            />
          </Card>
        </div>

        <SectionLabel>Where it goes</SectionLabel>
        <Card title="Tasks done by area">
          {byArea.length ? (
            <HBars
              label="Tasks done by area"
              rows={byArea.map((a) => {
                const area = a.areaId ? areaById.get(a.areaId) : undefined;
                return {
                  key: a.areaId ?? "none",
                  label: areaName(a.areaId),
                  value: a.count,
                  display: String(a.count),
                  color: area ? areaColorVar(area.color) : "var(--label-tertiary)",
                };
              })}
            />
          ) : (
            <Empty>Nothing finished in this range yet.</Empty>
          )}
        </Card>
        <Card title="Rituals" note="Days with a finished daily plan and shutdown; cycles reviewed after they ended.">
          <div className="grid grid-cols-3 gap-2">
            <Meter label="Daily plan" done={rit.plan.done} of={rit.plan.of} />
            <Meter label="Shutdown" done={rit.shutdown.done} of={rit.shutdown.of} />
            <Meter label="Cycle review" done={rit.review.done} of={rit.review.of} />
          </div>
        </Card>

        <SectionLabel>Putting things off</SectionLabel>
        {skips.total ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Card title={`Why things were skipped · ${skips.total}`}>
                <HBars
                  label="Skip reasons"
                  rows={skips.reasons.map((x) => ({
                    key: x.reason,
                    label: x.reason === "none" ? "No reason given" : (skipReasonLabel(x.reason) ?? x.reason),
                    value: x.count,
                    display: String(x.count),
                  }))}
                />
              </Card>
              <Card title="Skipped most">
                <HBars
                  label="Most-skipped areas and goals"
                  rows={[
                    ...skips.areas.slice(0, 3).map((x) => ({
                      key: `a${x.areaId}`,
                      label: areaName(x.areaId),
                      value: x.count,
                      display: `${x.count}×`,
                      color:
                        x.areaId && areaById.get(x.areaId) ? areaColorVar(areaById.get(x.areaId)!.color) : undefined,
                    })),
                    ...skips.goals.slice(0, 3).map((x) => ({
                      key: `g${x.goalId}`,
                      label: `◎ ${goalName(x.goalId)}`,
                      value: x.count,
                      display: `${x.count}×`,
                    })),
                  ]}
                />
              </Card>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Card title="Skips by day of the week">
                <BarChart
                  label="Skips by day of the week"
                  bars={[...Array(7).keys()]
                    .map((i) => (i + ws) % 7)
                    .map((d) => ({
                      key: String(d),
                      label: WEEKDAYS[d],
                      value: skips.weekdays[d],
                      highlight: skips.weekdays[d] === Math.max(...skips.weekdays) && skips.weekdays[d] > 0,
                      partial: !(skips.weekdays[d] === Math.max(...skips.weekdays)),
                    }))}
                />
              </Card>
              <Card title="Stale tasks at the end of each week" note="Open tasks skipped 3 times or more.">
                <BarChart
                  label="Stale tasks per week"
                  bars={stale.map((w, i) => ({
                    key: w.week,
                    label: shortDay(w.week),
                    value: w.count,
                    highlight: i === stale.length - 1,
                  }))}
                />
              </Card>
            </div>
          </>
        ) : (
          <Card title="Skips">
            <Empty>
              No skips in this range. When you move a planned task, Orbit asks why; the answers show up here.
            </Empty>
          </Card>
        )}
        <Card title="Before they got done">
          {postponed.tasks ? (
            <p className="text-callout">
              {postponed.tasks === 1 ? "The 1 task you finished was" : `The ${postponed.tasks} tasks you finished were`}{" "}
              put off <strong className="tabular">{postponed.average}×</strong> on average;{" "}
              <strong className="tabular">{Math.round(postponed.firstTime * 100)}%</strong> got done without being
              moved.
            </p>
          ) : (
            <Empty>Nothing finished in this range yet.</Empty>
          )}
        </Card>

        <SectionLabel>Balance</SectionLabel>
        <Card
          title="Area health"
          note="From goal health, overdue and stale tasks, and how long since something was done."
        >
          {areas.length ? null : (
            <Empty>
              No areas yet.{" "}
              <Link href="/areas" className="font-medium text-accent-text">
                Add your life areas
              </Link>{" "}
              to see how each is doing.
            </Empty>
          )}
          <ul className="flex flex-col" aria-label="Area health">
            {areas.map((a) => {
              const h = healths?.get(a.id);
              return (
                <li key={a.id}>
                  <Link
                    href={`/area?id=${a.id}`}
                    className="flex min-h-row items-center gap-3 rounded-md px-1 py-1.5 hover:bg-fill"
                  >
                    <AreaIcon icon={a.icon} color={a.color} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{a.name}</span>
                      {h?.reasons.length ? (
                        <span className="block truncate text-footnote text-label-secondary">
                          {h.reasons.join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-1.5 text-footnote text-label-secondary">
                      {h ? HEALTH_LABEL[h.level] : null}
                      <HealthDot health={h} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card
          title="Wheel of Life"
          note={
            latest
              ? `Rated ${dayLabel(latest.date, today).toLowerCase()}${previous ? `; the dashed line is ${dayLabel(previous.date, today).toLowerCase()}` : ""}.`
              : "Rate how each area is going and how much it matters. It's also a step in each Quarterly Review."
          }
          action={
            <Button variant="secondary" icon={<Gauge className="size-4" />} onClick={() => setRating(true)}>
              Rate now
            </Button>
          }
        >
          {latest ? (
            <div className="flex justify-center">
              <Radar
                axes={latest.scores.map((s) => ({ key: s.areaId, label: areaName(s.areaId) }))}
                current={latest.scores.map((s) => s.score)}
                previous={
                  previous
                    ? latest.scores.map((s) => previous.scores.find((p) => p.areaId === s.areaId)?.score ?? 0)
                    : undefined
                }
              />
            </div>
          ) : null}
        </Card>
        {latest ? (
          <Card
            title="Time vs what matters"
            note="Each area's share of your focus time against its share of importance."
          >
            {values.some((v) => v.minutes) ? (
              <ul className="flex flex-col gap-3" aria-label="Time vs what matters">
                {values.map((v) => (
                  <li key={v.areaId} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2 text-callout">
                      <span className="truncate">{areaName(v.areaId)}</span>
                      <span
                        className={
                          v.gap <= -10
                            ? "text-footnote font-medium text-warning-text"
                            : "text-footnote text-label-secondary"
                        }
                      >
                        {v.gap <= -10
                          ? `${Math.abs(v.gap)} pts less time than it matters`
                          : v.gap >= 10
                            ? `${v.gap} pts more time`
                            : "In step"}
                      </span>
                    </span>
                    <ShareBar label="Focus" share={v.focusShare} color="var(--accent)" />
                    <ShareBar label="Matters" share={v.importanceShare} color="var(--label-tertiary)" />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No focus sessions in this range yet.</Empty>
            )}
          </Card>
        ) : null}

        <MoneyInsights />
        <SectionLabel>Mood and energy</SectionLabel>
        <Card
          title="On days you felt…"
          note="From your journal: tasks done and focus time on days with each mood and energy."
        >
          {mood.enough ? (
            <div className="grid gap-4 md:grid-cols-2">
              <MoodTable title="Mood" rows={mood.mood} labels={MOOD} />
              <MoodTable title="Energy" rows={mood.energy} labels={ENERGY} />
            </div>
          ) : (
            <Empty>
              {mood.rated} day{mood.rated === 1 ? "" : "s"} rated so far; this needs at least 7. The evening Shutdown
              and the{" "}
              <Link href="/journal" className="font-medium text-accent-text">
                Journal
              </Link>{" "}
              record mood and energy.
            </Empty>
          )}
        </Card>
      </PageBody>
      <WheelRatingDialog open={rating} onOpenChange={setRating} areas={areas} last={latest} />
    </>
  );
}

function Card({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="mb-3 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-headline">{title}</h3>
          {note ? <p className="text-footnote text-label-secondary">{note}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-callout text-label-secondary">{children}</p>;
}

function ShareBar({ label, share, color }: { label: string; share: number; color: string }) {
  return (
    <span className="grid grid-cols-[4rem_1fr_2.5rem] items-center gap-2 text-caption text-label-tertiary">
      {label}
      <span className="h-1.5 overflow-hidden rounded-full bg-fill">
        <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
      </span>
      <span className="text-right tabular">{Math.round(share * 100)}%</span>
    </span>
  );
}

function MoodTable({
  title,
  rows,
  labels,
}: {
  title: string;
  rows: { level: number; days: number; done: number | null; focusMinutes: number | null }[];
  labels: string[];
}) {
  const name = (level: number) => labels[level - 1] ?? `${level} of 5`;
  return (
    <table className="w-full text-callout">
      <caption className="mb-1 text-left text-footnote font-semibold text-label-secondary">{title}</caption>
      <thead>
        <tr className="text-caption text-label-tertiary">
          <th className="py-1 text-left font-normal">Level</th>
          <th className="py-1 text-right font-normal">Days</th>
          <th className="py-1 text-right font-normal">Tasks done</th>
          <th className="py-1 text-right font-normal">Focus</th>
        </tr>
      </thead>
      <tbody>
        {[...rows].reverse().map((r) => (
          <tr key={r.level} className="border-t border-separator">
            <td className="py-1.5">{name(r.level)}</td>
            <td className="py-1.5 text-right text-label-secondary tabular">{r.days}</td>
            <td className="py-1.5 text-right tabular">{r.done ?? "–"}</td>
            <td className="py-1.5 text-right tabular">
              {r.focusMinutes != null ? `${Math.round(r.focusMinutes)}m` : "–"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
