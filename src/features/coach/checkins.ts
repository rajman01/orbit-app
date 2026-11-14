import { cyclePoints, timeOfDay } from "@/features/cycles/model";
import { inQuietHours } from "@/features/reminders/model";
import { defaultSettings, type Settings } from "@/features/settings/model";
import type { Task } from "@/features/tasks/model";
import { addDays, dayOf, daysBetween, weekday, type Day } from "@/lib/dates";
import type { SyncedDoc } from "@/lib/sync/entities";

/**
 * PRD §8.4 / AI-7: when the coach checks in on its own, and the facts it should talk about.
 * Pure, so it can be unit tested; the server loads the data and delivers (lib/coach/checkins.ts).
 */

export type CheckinKind = "missed_rituals" | "avoiding" | "off_track" | "cycle_behind" | "weekly";

export interface Checkin {
  /** Sent once per key. */
  key: string;
  kind: CheckinKind;
  /** The conversation's title, and the push notification. */
  title: string;
  push: { title: string; body: string };
  /** What happened, in plain facts, for the coach to write from (and the fallback message). */
  facts: string;
  fallback: string;
}

type Ritual = Pick<SyncedDoc<"rituals">, "type" | "date" | "completedAt">;
type Goal = Pick<SyncedDoc<"goals">, "id" | "title" | "status" | "health"> & { healthSetAt?: number };
type Cycle = Pick<
  SyncedDoc<"cycles">,
  "id" | "number" | "startDate" | "endDate" | "committedAt" | "committedTaskIds" | "committedPts"
>;
type TaskEvent = Pick<SyncedDoc<"taskEvents">, "taskId" | "type" | "reason" | "at">;

/** Check-ins are on by default, except at Gentle strictness (§8.5); the setting overrides both. */
export function checkinsEnabled(s: Partial<Settings>): boolean {
  return s.aiCheckins ?? s.strictness !== "gentle";
}

const q = (s: string) => `“${s.length > 50 ? `${s.slice(0, 47)}…` : s}”`;

export function dueCheckins(opts: {
  now: number;
  settings: Partial<Settings>;
  /** The first day Orbit was used (no "missed" check-ins before there was a habit to miss). */
  firstDay: Day;
  rituals: Ritual[];
  tasks: Task[];
  taskEvents: TaskEvent[];
  goals: Goal[];
  cycles: Cycle[];
  sent: Set<string>;
}): Checkin[] {
  const s = { ...defaultSettings(), ...opts.settings };
  if (!checkinsEnabled(s)) return [];
  const tz = s.timezone;
  const today = dayOf(opts.now, tz);
  const time = timeOfDay(opts.now, tz);
  if (inQuietHours(time, s.quietHours ?? defaultSettings().quietHours!) || time < "10:00" || time >= "20:00") {
    return [];
  }
  const out: Checkin[] = [];
  const push = (c: Checkin) => !opts.sent.has(c.key) && out.push(c);

  // Two days in a row with no Daily Plan or Shutdown, after a day that had one: once per lapse.
  const didRitual = (day: Day) =>
    opts.rituals.some(
      (r) => r.date === day && r.completedAt != null && (r.type === "daily_plan" || r.type === "daily_shutdown"),
    );
  const y1 = addDays(today, -1);
  const y2 = addDays(today, -2);
  const y3 = addDays(today, -3);
  if (y3 >= opts.firstDay && !didRitual(y1) && !didRitual(y2) && didRitual(y3)) {
    push({
      key: `missed:${y1}`,
      kind: "missed_rituals",
      title: "Check-in · two days off the plan",
      push: { title: "Your coach", body: "Two days without a plan. Want to reset today together?" },
      facts: `The user did their Daily Plan or Shutdown on ${y3}, then neither on ${y2} or ${y1}. Today is ${today}.`,
      fallback:
        "Two days without a Daily Plan or Shutdown. No judgement — days get away from all of us. Want to do a 3-minute plan for today together? Just say “let's plan”.",
    });
  }

  // A task skipped for "avoiding it" twice or more, still open.
  const avoided = new Map<string, number>();
  for (const e of opts.taskEvents) {
    if (e.type === "skip" && e.reason === "avoiding") avoided.set(e.taskId, (avoided.get(e.taskId) ?? 0) + 1);
  }
  for (const [taskId, count] of avoided) {
    const t = opts.tasks.find((x) => x.id === taskId);
    if (count < 2 || !t || t.deletedAt != null || t.status === "done" || t.status === "cancelled") continue;
    push({
      key: `avoid:${taskId}`,
      kind: "avoiding",
      title: `Check-in · ${q(t.title)}`,
      push: { title: "Your coach", body: `You've put off ${q(t.title)} a few times. Want to make it smaller?` },
      facts: `The task ${q(t.title)} (task id ${t.id}${t.effort ? `, ${t.effort} points` : ""}) has been skipped ${count} times with the reason "avoiding it"${t.nextStep ? `; its next step is ${q(t.nextStep)}` : "; it has no next step"}.`,
      fallback: `You've moved ${q(t.title)} ${count} times because you were avoiding it. That usually means it's too big or unclear. Want me to break it into a first step you could do in 5 minutes?`,
    });
  }

  // An active goal marked off track (once each time it becomes off track).
  for (const g of opts.goals) {
    if (g.status !== "active" || g.health !== "off_track") continue;
    push({
      key: `offtrack:${g.id}:${g.healthSetAt ?? 0}`,
      kind: "off_track",
      title: `Check-in · ${q(g.title)}`,
      push: { title: "Your coach", body: `${q(g.title)} is off track. Want to look at it together?` },
      facts: `The active goal ${q(g.title)} (goal id ${g.id}) is marked off track.`,
      fallback: `${q(g.title)} is marked off track. Do you want to change the plan, push the date, or decide it's not the right goal right now? Any of those is fine — let's pick one.`,
    });
  }

  // A committed cycle past its midpoint with under half its points done.
  for (const c of opts.cycles) {
    if (!c.committedAt || c.committedPts <= 0 || today < c.startDate || today > c.endDate) continue;
    const length = daysBetween(c.startDate, c.endDate) + 1;
    const day = daysBetween(c.startDate, today) + 1;
    if (day * 2 < length) continue;
    const pts = cyclePoints(opts.tasks, c);
    if (pts.done * 2 >= pts.committed) continue;
    push({
      key: `cycle:${c.id}`,
      kind: "cycle_behind",
      title: `Check-in · cycle ${c.number} halfway`,
      push: {
        title: "Your coach",
        body: `Halfway through cycle ${c.number}, ${pts.done} of ${pts.committed} points done. Re-plan?`,
      },
      facts: `Cycle ${c.number} runs ${c.startDate} to ${c.endDate}; today is day ${day} of ${length}. Committed ${pts.committed} points, done ${pts.done} (${pts.doneTasks} of ${pts.tasks} tasks).`,
      fallback: `We're halfway through cycle ${c.number} and ${pts.done} of ${pts.committed} committed points are done. Want to pick what really matters for the rest of the cycle and move the rest out?`,
    });
  }

  // Weekly summary: on the last day of their week, from 18:00.
  const lastDayOfWeek = (s.weekStartDay + 6) % 7;
  if (weekday(today) === lastDayOfWeek && time >= "18:00") {
    push({
      key: `weekly:${today}`,
      kind: "weekly",
      title: "Your week",
      push: { title: "Your week in Orbit", body: "Your weekly summary is ready." },
      facts: "", // filled in by the server from the week's data (weekFacts)
      fallback: "",
    });
  }
  return out;
}

/** The week's numbers for the weekly summary, as plain facts. */
export function weekFacts(opts: {
  today: Day;
  timezone: string;
  tasks: Task[];
  taskEvents: TaskEvent[];
  rituals: Ritual[];
  xpGained: number;
}): { facts: string; fallback: string } {
  const from = addDays(opts.today, -6);
  const inWeek = (at: number) => {
    const d = dayOf(at, opts.timezone);
    return d >= from && d <= opts.today;
  };
  const done = opts.tasks.filter((t) => t.status === "done" && t.completedAt != null && inWeek(t.completedAt));
  const points = done.reduce((n, t) => n + (t.effort ?? 0), 0);
  const skips = opts.taskEvents.filter((e) => e.type === "skip" && inWeek(e.at));
  const reasons = new Map<string, number>();
  for (const e of skips) if (e.reason) reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + 1);
  const topReasons = [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const moved = new Map<string, number>();
  for (const e of skips) moved.set(e.taskId, (moved.get(e.taskId) ?? 0) + 1);
  const mostMoved = [...moved]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => {
      const t = opts.tasks.find((x) => x.id === id);
      return t ? `${q(t.title)} (${n}×)` : null;
    })
    .filter(Boolean);
  const plans = opts.rituals.filter((r) => r.type === "daily_plan" && r.completedAt && r.date >= from).length;
  const shutdowns = opts.rituals.filter((r) => r.type === "daily_shutdown" && r.completedAt && r.date >= from).length;
  const facts = [
    `Week ${from} to ${opts.today}.`,
    `Tasks done: ${done.length} (${points} points)${
      done.length
        ? `, e.g. ${done
            .slice(0, 5)
            .map((t) => q(t.title))
            .join(", ")}`
        : ""
    }.`,
    `Moved or skipped: ${skips.length}${topReasons.length ? `; reasons: ${topReasons.map(([r, n]) => `${r.replace(/_/g, " ")} ${n}`).join(", ")}` : ""}${mostMoved.length ? `; moved most: ${mostMoved.join(", ")}` : ""}.`,
    `Daily Plans done: ${plans} of 7; Shutdowns: ${shutdowns} of 7.`,
    `XP gained: ${opts.xpGained}.`,
  ].join("\n");
  const fallback = `This week: ${done.length} ${done.length === 1 ? "task" : "tasks"} done (${points} points), ${plans} Daily Plans and ${shutdowns} Shutdowns, ${skips.length} moved. Want to look at what to carry into next week?`;
  return { facts, fallback };
}
