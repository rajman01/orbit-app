import { cycleStats, startOfWeek, type Cycle, type Ritual } from "@/features/cycles/model";
import { goalProgress, suggestHealth, type Goal, type KeyResult } from "@/features/goals/model";
import { isStale, STALE_POSTPONES } from "@/features/today/model";
import { isOpen, type Task } from "@/features/tasks/model";
import { addDays, daysBetween, dayOf, weekday, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";

/**
 * Phase 3A (INS-1–4, AREA-3/4): what's actually happening, worked out on the device from data it
 * already has. Every function here is pure; the Insights page and the coach call them.
 */

type Event = Pick<SyncedDoc<"taskEvents">, "taskId" | "type" | "reason" | "at" | "deletedAt">;
type Session = Pick<SyncedDoc<"focusSessions">, "taskId" | "startedAt" | "actualMinutes" | "deletedAt">;
type Xp = Pick<SyncedDoc<"xpEvents">, "at" | "amount" | "deletedAt">;
type Journal = Pick<SyncedDoc<"journalEntries">, "date" | "mood" | "energy" | "deletedAt">;
export type AreaRating = SyncedDoc<"areaRatings">;
export type AreaRatingFields = EntityFields<"areaRatings">;

const alive = <T extends { deletedAt?: number | null }>(rows: T[]) => rows.filter((r) => r.deletedAt == null);

// ---------------------------------------------------------------- range

export interface Range {
  from: Day;
  to: Day;
  /** The cycles in the range, oldest first (the current one last). */
  cycles: Cycle[];
}

/** The last `n` cycles up to and including the current one. */
export function insightRange(cycles: Cycle[], today: Day, n: number): Range {
  const started = [...cycles].filter((c) => c.startDate <= today).sort((a, b) => a.number - b.number);
  const picked = started.slice(-n);
  return { from: picked[0]?.startDate ?? today, to: today, cycles: picked };
}

/** Week starts (by the user's week start) from `from` to `to`. */
export function weeksIn(from: Day, to: Day, weekStart: number): Day[] {
  const out: Day[] = [];
  for (let w = startOfWeek(from, weekStart); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

const within = (d: Day, r: Pick<Range, "from" | "to">) => d >= r.from && d <= r.to;

// ---------------------------------------------------------------- INS-1

export interface CyclePoint {
  number: number;
  startDate: Day;
  current: boolean;
  completion: number;
  focusHours: number;
  xp: number;
}

/** Completion, focus and XP per cycle. */
export function cycleTrend(
  r: Range,
  tasks: Task[],
  sessions: Session[],
  xp: Xp[],
  tz: string,
  today: Day,
): CyclePoint[] {
  return r.cycles.map((c) => {
    const s = cycleStats(c, tasks, sessions as never, xp, tz);
    return {
      number: c.number,
      startDate: c.startDate,
      current: c.startDate <= today && c.endDate >= today,
      completion: s.completion,
      focusHours: s.focusHours,
      xp: s.xp,
    };
  });
}

/** Focus hours per week. */
export function focusByWeek(sessions: Session[], r: Range, tz: string, weekStart: number) {
  const weeks = weeksIn(r.from, r.to, weekStart);
  const minutes = new Map(weeks.map((w) => [w, 0]));
  for (const s of alive(sessions)) {
    const d = dayOf(s.startedAt, tz);
    if (!within(d, r)) continue;
    const w = startOfWeek(d, weekStart);
    minutes.set(w, (minutes.get(w) ?? 0) + s.actualMinutes);
  }
  return weeks.map((week) => ({ week, hours: Math.round(((minutes.get(week) ?? 0) / 60) * 10) / 10 }));
}

/** Top-level tasks finished in the range, per area (null = no area), most first. */
export function doneByArea(tasks: Task[], r: Range, tz: string) {
  const by = new Map<string | null, { count: number; points: number }>();
  for (const t of tasks) {
    if (t.deletedAt != null || t.parentTaskId || t.status !== "done" || !t.completedAt) continue;
    if (!within(dayOf(t.completedAt, tz), r)) continue;
    const e = by.get(t.areaId) ?? { count: 0, points: 0 };
    e.count++;
    e.points += t.effort ?? 0;
    by.set(t.areaId, e);
  }
  return [...by.entries()].map(([areaId, v]) => ({ areaId, ...v })).sort((a, b) => b.count - a.count);
}

export interface Consistency {
  done: number;
  of: number;
}

/**
 * How often the rituals happened: the daily plan and shutdown on each day of the range (today
 * counts only once it's done), and the review of each cycle that has ended.
 */
export function ritualConsistency(
  rituals: Pick<Ritual, "type" | "date" | "completedAt" | "cycleId" | "deletedAt">[],
  r: Range,
  today: Day,
) {
  const done = alive(rituals).filter((x) => x.completedAt != null);
  const days = (type: Ritual["type"]): Consistency => {
    const doneDays = new Set(done.filter((x) => x.type === type && within(x.date, r)).map((x) => x.date));
    const of = Math.max(0, daysBetween(r.from, r.to) + 1 - (doneDays.has(today) ? 0 : 1));
    return { done: doneDays.size, of: Math.max(of, doneDays.size) };
  };
  const ended = r.cycles.filter((c) => c.endDate < today);
  const reviewed = new Set(done.filter((x) => x.type === "cycle_review").map((x) => x.cycleId));
  return {
    plan: days("daily_plan"),
    shutdown: days("daily_shutdown"),
    review: { done: ended.filter((c) => reviewed.has(c.id)).length, of: ended.length },
  };
}

/** XP earned per week, and the running total at the end of each. */
export function xpByWeek(xp: Xp[], r: Range, tz: string, weekStart: number) {
  const weeks = weeksIn(r.from, r.to, weekStart);
  const live = alive(xp);
  const before = live.filter((e) => dayOf(e.at, tz) < weeks[0]).reduce((n, e) => n + e.amount, 0);
  let total = before;
  return weeks.map((week) => {
    const end = addDays(week, 6);
    const earned = live
      .filter((e) => {
        const d = dayOf(e.at, tz);
        return d >= week && d <= end;
      })
      .reduce((n, e) => n + e.amount, 0);
    total += earned;
    return { week, xp: earned, total };
  });
}

// ---------------------------------------------------------------- INS-2

export interface SkipInsights {
  total: number;
  reasons: { reason: string; count: number }[];
  areas: { areaId: string | null; count: number }[];
  goals: { goalId: string; count: number }[];
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
}

/** Skips (moving a planned task later) in the range: why, where and on which days. */
export function skipInsights(events: Event[], tasks: Task[], r: Range, tz: string): SkipInsights {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const reasons = new Map<string, number>();
  const areas = new Map<string | null, number>();
  const goals = new Map<string, number>();
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (const e of alive(events)) {
    if (e.type !== "skip") continue;
    const d = dayOf(e.at, tz);
    if (!within(d, r)) continue;
    total++;
    const reason = e.reason ?? "none";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    const t = byId.get(e.taskId);
    areas.set(t?.areaId ?? null, (areas.get(t?.areaId ?? null) ?? 0) + 1);
    if (t?.goalId) goals.set(t.goalId, (goals.get(t.goalId) ?? 0) + 1);
    weekdays[weekday(d)]++;
  }
  const sorted = <K>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    total,
    reasons: sorted(reasons).map(([reason, count]) => ({ reason, count })),
    areas: sorted(areas).map(([areaId, count]) => ({ areaId, count })),
    goals: sorted(goals).map(([goalId, count]) => ({ goalId, count })),
    weekdays,
  };
}

/** Of the tasks finished in the range: how often each was put off first. */
export function postponementsBeforeDone(tasks: Task[], r: Range, tz: string) {
  const done = tasks.filter(
    (t) =>
      t.deletedAt == null &&
      !t.parentTaskId &&
      t.status === "done" &&
      t.completedAt &&
      within(dayOf(t.completedAt, tz), r),
  );
  const counts = done.map((t) => t.postponeCount ?? 0);
  const sum = counts.reduce((a, b) => a + b, 0);
  return {
    tasks: done.length,
    average: done.length ? Math.round((sum / done.length) * 10) / 10 : 0,
    firstTime: done.length ? counts.filter((c) => c === 0).length / done.length : 0,
  };
}

/**
 * Stale tasks at the end of each week: open tasks that had been skipped STALE_POSTPONES times or
 * more by then. (Tasks stale only from being untouched aren't reconstructable and aren't counted.)
 */
export function staleTrend(tasks: Task[], events: Event[], r: Range, tz: string, weekStart: number) {
  const skips = new Map<string, number[]>();
  for (const e of alive(events)) if (e.type === "skip") skips.set(e.taskId, [...(skips.get(e.taskId) ?? []), e.at]);
  return weeksIn(r.from, r.to, weekStart).map((week) => {
    const end = addDays(week, 6) < r.to ? addDays(week, 6) : r.to;
    let count = 0;
    for (const t of tasks) {
      if (t.parentTaskId) continue;
      const at = (skips.get(t.id) ?? []).filter((x) => dayOf(x, tz) <= end).sort((a, b) => a - b);
      if (at.length < STALE_POSTPONES) continue;
      const closedAt = t.deletedAt ?? t.completedAt ?? t.cancelledAt ?? null;
      if (closedAt != null && dayOf(closedAt, tz) <= end) continue;
      count++;
    }
    return { week, count };
  });
}

// ---------------------------------------------------------------- AREA-3

export type HealthLevel = "green" | "amber" | "red";

export interface AreaHealth {
  level: HealthLevel;
  reasons: string[];
  overdue: number;
  stale: number;
  /** Days since a task in the area was done (null: never). */
  quietDays: number | null;
}

export const QUIET_AMBER_DAYS = 14;
export const QUIET_RED_DAYS = 21;
export const RED_TASKS = 3;

/**
 * AREA-3: red for an off-track goal, more than 3 overdue or stale tasks, or nothing done for 3
 * weeks while it has active goals; amber for an at-risk goal, any overdue or stale task, or 2
 * quiet weeks; green otherwise.
 */
export function areaHealth(
  areaId: string,
  data: { goals: Goal[]; tasks: Task[]; today: Day; now: number; tz: string; touched?: Map<string, number> },
): AreaHealth {
  const goals = data.goals.filter((g) => g.areaId === areaId && g.deletedAt == null && g.status === "active");
  const tasks = data.tasks.filter((t) => t.areaId === areaId && t.deletedAt == null && !t.parentTaskId);
  const open = tasks.filter(isOpen);
  const overdue = open.filter((t) => t.status !== "inbox" && t.dueDate != null && t.dueDate < data.today).length;
  const stale = open.filter((t) => isStale(t, data.today, data.now, data.touched?.get(t.id))).length;
  const lastDone = Math.max(0, ...tasks.filter((t) => t.status === "done" && t.completedAt).map((t) => t.completedAt!));
  const quietDays = lastDone ? daysBetween(dayOf(lastDone, data.tz), data.today) : null;
  // Quiet counts from the last thing done, or from when its oldest active goal began if nothing has
  // been done yet, so a brand-new goal doesn't make its area look neglected.
  const since = lastDone || Math.min(...goals.map((g) => g.createdAt));
  const quietFor = goals.length ? daysBetween(dayOf(since, data.tz), data.today) : 0;
  const quiet = goals.length > 0 && quietFor >= QUIET_AMBER_DAYS;

  const red: string[] = [];
  const amber: string[] = [];
  const off = goals.filter((g) => g.health === "off_track");
  const risk = goals.filter((g) => g.health === "at_risk");
  if (off.length) red.push(`${off.length === 1 ? `“${off[0].title}” is` : `${off.length} goals are`} off track`);
  if (risk.length) amber.push(`${risk.length === 1 ? `“${risk[0].title}” is` : `${risk.length} goals are`} at risk`);
  const plural = (n: number, w: string) => `${n} ${w} task${n === 1 ? "" : "s"}`;
  if (overdue) (overdue > RED_TASKS ? red : amber).push(plural(overdue, "overdue"));
  if (stale) (stale > RED_TASKS ? red : amber).push(plural(stale, "stale"));
  if (quiet) {
    const msg = lastDone
      ? `Nothing done in ${quietFor} days`
      : `Nothing done since its goals began, ${quietFor} days ago`;
    (quietFor >= QUIET_RED_DAYS ? red : amber).push(msg);
  }
  return {
    level: red.length ? "red" : amber.length ? "amber" : "green",
    reasons: [...red, ...amber],
    overdue,
    stale,
    quietDays,
  };
}

/** Goals with no health set take the suggested one (as goal cards show it), for area health. */
export function withSuggestedHealth(goals: Goal[], krs: KeyResult[], tasks: Task[], today: Day, tz: string): Goal[] {
  return goals.map((g) =>
    g.health
      ? g
      : {
          ...g,
          health: suggestHealth(
            g,
            goalProgress(
              krs.filter((k) => k.goalId === g.id),
              tasks.filter((t) => t.goalId === g.id),
            ),
            today,
            dayOf(g.createdAt, tz),
          ),
        },
  );
}

// ---------------------------------------------------------------- AREA-4 / INS-3

export function ratingId(userId: string, date: Day): string {
  return `r${date.replaceAll("-", "")}${userId}`.slice(0, 40);
}

/**
 * A new rating's starting values: each area's last score and importance, or the middle for an area
 * never rated.
 */
export function startingScores(areas: { id: string }[], last: AreaRating | undefined): AreaRatingFields["scores"] {
  const prev = new Map((last?.scores ?? []).map((s) => [s.areaId, s]));
  return areas.map((a) => ({
    areaId: a.id,
    score: prev.get(a.id)?.score ?? 5,
    importance: prev.get(a.id)?.importance ?? 5,
  }));
}

/**
 * INS-3: each area's share of focus time against its share of importance. A gap is how many
 * percentage points focus trails (negative) or exceeds (positive) importance.
 */
export function timeVsValues(sessions: Session[], tasks: Task[], rating: AreaRating | undefined, r: Range, tz: string) {
  if (!rating) return [];
  const areaOf = new Map(tasks.map((t) => [t.id, t.areaId]));
  const minutes = new Map<string, number>();
  for (const s of alive(sessions)) {
    if (!within(dayOf(s.startedAt, tz), r)) continue;
    const a = areaOf.get(s.taskId);
    if (a) minutes.set(a, (minutes.get(a) ?? 0) + s.actualMinutes);
  }
  const totalMin = [...minutes.values()].reduce((a, b) => a + b, 0);
  const totalImp = rating.scores.reduce((a, s) => a + s.importance, 0);
  return rating.scores
    .map((s) => {
      const focusShare = totalMin ? (minutes.get(s.areaId) ?? 0) / totalMin : 0;
      const importanceShare = totalImp ? s.importance / totalImp : 0;
      return {
        areaId: s.areaId,
        minutes: minutes.get(s.areaId) ?? 0,
        importance: s.importance,
        focusShare,
        importanceShare,
        gap: Math.round((focusShare - importanceShare) * 100),
      };
    })
    .sort((a, b) => b.importanceShare - a.importanceShare);
}

// ---------------------------------------------------------------- INS-4

export const MIN_MOOD_DAYS = 7;

/**
 * INS-4: for each mood (and energy) level 1–5, the average tasks done and focus minutes on days
 * with that rating in the journal.
 */
export function moodVsDone(journal: Journal[], tasks: Task[], sessions: Session[], r: Range, tz: string) {
  const doneOn = new Map<Day, number>();
  for (const t of tasks)
    if (t.deletedAt == null && !t.parentTaskId && t.status === "done" && t.completedAt) {
      const d = dayOf(t.completedAt, tz);
      doneOn.set(d, (doneOn.get(d) ?? 0) + 1);
    }
  const focusOn = new Map<Day, number>();
  for (const s of alive(sessions)) {
    const d = dayOf(s.startedAt, tz);
    focusOn.set(d, (focusOn.get(d) ?? 0) + s.actualMinutes);
  }
  const days = alive(journal).filter((j) => within(j.date, r));
  const by = (key: "mood" | "energy") =>
    [1, 2, 3, 4, 5].map((level) => {
      const ds = days.filter((j) => j[key] === level).map((j) => j.date);
      const avg = (m: Map<Day, number>) =>
        ds.length ? Math.round((ds.reduce((n, d) => n + (m.get(d) ?? 0), 0) / ds.length) * 10) / 10 : null;
      return { level, days: ds.length, done: avg(doneOn), focusMinutes: avg(focusOn) };
    });
  const rated = days.filter((j) => j.mood != null || j.energy != null).length;
  return { rated, enough: rated >= MIN_MOOD_DAYS, mood: by("mood"), energy: by("energy") };
}

// ---------------------------------------------------------------- summary (coach, headlines)

/** A few plain sentences about the range, for the page's headline and the coach. */
export function headlines(opts: {
  trend: CyclePoint[];
  skips: SkipInsights;
  reasonLabel: (id: string) => string;
  areaName: (id: string | null) => string;
}): string[] {
  const out: string[] = [];
  const past = opts.trend.filter((c) => !c.current);
  if (past.length >= 2) {
    const last = past[past.length - 1].completion;
    const prev = past[past.length - 2].completion;
    const diff = Math.round((last - prev) * 100);
    out.push(
      `Cycle ${past[past.length - 1].number} finished ${Math.round(last * 100)}% of its plan` +
        (diff
          ? `, ${Math.abs(diff)} points ${diff > 0 ? "up on" : "down from"} the cycle before.`
          : ", the same as before."),
    );
  }
  if (opts.skips.total >= 3) {
    const top = opts.skips.reasons[0];
    if (top && top.reason !== "none")
      out.push(
        `The most common reason for skipping is “${opts.reasonLabel(top.reason)}” (${top.count} of ${opts.skips.total}).`,
      );
    const area = opts.skips.areas[0];
    if (area && area.count >= 2) out.push(`${opts.areaName(area.areaId)} is skipped most (${area.count}×).`);
    const days = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    const max = Math.max(...opts.skips.weekdays);
    const day = opts.skips.weekdays.indexOf(max);
    if (max >= 3 && max >= opts.skips.total * 0.3) out.push(`Most skips happen on ${days[day]}.`);
  }
  return out;
}
