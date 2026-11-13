import { timeOfDay } from "@/features/cycles/model";
import { habitStatus, type Habit, type HabitLog } from "@/features/habits/model";
import { defaultSettings, type Settings } from "@/features/settings/model";
import { dayOf, type Day } from "@/lib/dates";
import type { SyncedDoc } from "@/lib/sync/entities";

type Ritual = Pick<SyncedDoc<"rituals">, "type" | "date" | "completedAt">;
type Cycle = Pick<SyncedDoc<"cycles">, "id" | "number" | "endDate" | "reviewCompletedAt">;
type Reminder = Pick<SyncedDoc<"reminders">, "id" | "kind" | "title" | "body" | "url" | "fireAt" | "status">;

export interface Notification {
  /** Each notification is sent once: the key is remembered after sending. */
  key: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Is `time` within `[start, end)`? Handles ranges past midnight (22:00–07:00). */
export function inQuietHours(time: string, quiet: { start: string; end: string }): boolean {
  const t = minutes(time);
  const s = minutes(quiet.start);
  const e = minutes(quiet.end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** From `at` until `hours` later the same day: a late scheduler still delivers, a very late one doesn't. */
function within(time: string, at: string, hours: number): boolean {
  const d = minutes(time) - minutes(at);
  return d >= 0 && d < hours * 60;
}

/**
 * PRD §12: what to push right now for one user. Ritual reminders (RIT-4) at their times unless
 * already done; habit reminders for habits still due; one-off reminders the device scheduled (a
 * focus session ending). Quiet hours hold back everything except a focus session ending.
 */
export function dueNotifications(opts: {
  now: number;
  settings: Partial<Settings>;
  rituals: Ritual[];
  cycles: Cycle[];
  habits: Habit[];
  habitLogs: Pick<HabitLog, "habitId" | "date" | "value">[];
  reminders: Reminder[];
  dueTodayCount: number;
  sent: Set<string>;
}): Notification[] {
  const defaults = defaultSettings();
  const s = { ...defaults, ...opts.settings };
  const tz = s.timezone;
  const times = s.ritualTimes ?? defaults.ritualTimes!;
  const quiet = s.quietHours ?? defaults.quietHours!;
  const notify = s.notify ?? defaults.notify!;
  const today: Day = dayOf(opts.now, tz);
  const time = timeOfDay(opts.now, tz);
  const quietNow = inQuietHours(time, quiet);
  const done = (type: Ritual["type"]) =>
    opts.rituals.some((r) => r.type === type && r.date === today && r.completedAt != null);
  const out: Notification[] = [];
  const push = (n: Notification) => {
    if (!opts.sent.has(n.key)) out.push(n);
  };

  if (!quietNow) {
    if (notify.plan && within(time, times.plan, 3) && !done("daily_plan")) {
      push({
        key: `plan:${today}`,
        title: "Plan your day",
        body:
          opts.dueTodayCount > 0
            ? `${opts.dueTodayCount} ${opts.dueTodayCount === 1 ? "task is" : "tasks are"} due today. Pick your Must-dos.`
            : "Pick up to 3 Must-dos and give each a first step.",
        url: "/today",
        tag: "orbit-plan",
      });
    }
    if (notify.shutdown && within(time, times.shutdown, 2) && !done("daily_shutdown")) {
      push({
        key: `shutdown:${today}`,
        title: "Shut down the day",
        body: "Three minutes: tick off what got done and look at tomorrow.",
        url: "/today",
        tag: "orbit-shutdown",
      });
    }
    const cycle = opts.cycles.find((c) => c.endDate === today && !c.reviewCompletedAt);
    if (notify.review && cycle && within(time, times.review, 4)) {
      push({
        key: `review:${cycle.id}`,
        title: `Review cycle ${cycle.number}`,
        body: "Decide what's unfinished, look back, and plan the next cycle.",
        url: "/cycle?tab=review",
        tag: "orbit-review",
      });
    }
    if (notify.habits) {
      for (const h of opts.habits) {
        if (h.archivedAt != null || !h.reminderTime || !within(time, h.reminderTime, 2)) continue;
        const logs = opts.habitLogs.filter((l) => l.habitId === h.id);
        const status = habitStatus(h, logs, today, { weekStart: s.weekStartDay, startDay: dayOf(h.createdAt, tz) });
        if (!status.due) continue;
        push({
          key: `habit:${h.id}:${today}`,
          title: h.name,
          body: status.streak > 1 ? `Keep your ${status.streak}-${status.unit} streak going.` : "Time for your habit.",
          url: "/habits",
          tag: `orbit-habit-${h.id}`,
        });
      }
    }
  }

  for (const r of opts.reminders) {
    if (r.status !== "pending" || r.fireAt > opts.now || opts.now - r.fireAt > 30 * 60_000) continue;
    if (r.kind === "focus_end" ? !notify.focus : quietNow) continue;
    // Focus ends share the "Focusing on…" notification's tag, so they replace it.
    const tag = r.kind === "focus_end" ? "orbit-focus" : `orbit-${r.kind}`;
    push({ key: `reminder:${r.id}:${r.fireAt}`, title: r.title, body: r.body, url: r.url, tag });
  }
  return out;
}
