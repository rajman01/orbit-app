import { timeOfDay } from "@/features/cycles/model";
import { habitStatus, type Habit, type HabitLog } from "@/features/habits/model";
import { defaultSettings, type Settings } from "@/features/settings/model";
import { dayOf, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";
import { dateTitle, formatPersonDate, upcomingDates } from "@/features/people/model";
import { addQuarters, quarterDates, quarterLabel, quarterOf } from "@/features/quarters/model";
import { addDays } from "@/lib/dates";

type Ritual = Pick<SyncedDoc<"rituals">, "type" | "date" | "completedAt">;
type Cycle = Pick<SyncedDoc<"cycles">, "id" | "number" | "endDate" | "reviewCompletedAt">;
type Person = Pick<SyncedDoc<"people">, "id" | "name" | "emoji" | "color" | "dates" | "archivedAt">;
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
  /** Phase 2C.2: people with important dates. */
  people?: Person[];
  /** Phase 2D.2: quarters, for the Quarterly Plan and Review. */
  quarters?: Pick<SyncedDoc<"quarters">, "year" | "q" | "committedAt" | "reviewCompletedAt">[];
  /** Phase 3B: job leads with a next step. */
  jobLeads?: Pick<SyncedDoc<"jobLeads">, "id" | "company" | "role" | "stage" | "nextStep" | "nextDate">[];
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
    // RIT-7: plan the quarter on its first day (and the next one a week before it starts), review it
    // on its last day.
    if (notify.review) {
      const now = quarterOf(today);
      const nowDates = quarterDates(now);
      const next = addQuarters(now, 1);
      const doc = (r: { year: number; q: number }) => opts.quarters?.find((x) => x.year === r.year && x.q === r.q);
      if (within(time, times.plan, 3)) {
        if (today === nowDates.startDate && !doc(now)?.committedAt)
          push({
            key: `qplan:${now.year}${now.q}`,
            title: `Plan ${quarterLabel(now)}`,
            body: "A new quarter: choose the 3–5 goals that matter most.",
            url: "/quarter",
            tag: "orbit-quarter",
          });
        if (today === addDays(nowDates.endDate, -6) && !doc(next)?.committedAt)
          push({
            key: `qplan:${next.year}${next.q}`,
            title: `${quarterLabel(next)} starts in a week`,
            body: "Plan it when you're ready: the few goals that matter most.",
            url: `/quarter?q=${next.year}-Q${next.q}`,
            tag: "orbit-quarter",
          });
      }
      const d = doc(now);
      if (today === nowDates.endDate && within(time, times.review, 4) && d?.committedAt && !d.reviewCompletedAt)
        push({
          key: `qreview:${now.year}${now.q}`,
          title: `Review ${quarterLabel(now)}`,
          body: "Results, a decision on each unfinished goal, then the next quarter.",
          url: "/today",
          tag: "orbit-quarter",
        });
    }
    // REL-6: a week and a day before each important date, at Daily Plan time (once each).
    if ((notify.people ?? true) && within(time, times.plan, 3)) {
      for (const u of upcomingDates(opts.people ?? [], today, 7)) {
        if (u.inDays !== 7 && u.inDays !== 1) continue;
        const title = dateTitle(u.person.name, u.date);
        const when = new Date(`${u.on}T12:00:00Z`).toLocaleDateString("en-GB", {
          weekday: "long",
          timeZone: "UTC",
        });
        const turning =
          u.turning != null && u.turning > 0
            ? u.date.kind === "birthday"
              ? ` They turn ${u.turning}.`
              : ` ${u.turning} years.`
            : "";
        push({
          key: `date:${u.person.id}:${u.index}:${u.on}:${u.inDays}`,
          title: `${title} is ${u.inDays === 1 ? "tomorrow" : "in a week"}`,
          body: `${when}, ${formatPersonDate({ ...u.date, year: null })}.${turning}`,
          url: `/person?id=${u.person.id}`,
          tag: `orbit-date-${u.person.id}-${u.index}`,
        });
      }
    }
    // CAR-4: a job lead's next step, at Daily Plan time on its day (once).
    if ((notify.jobs ?? true) && within(time, times.plan, 3)) {
      for (const l of opts.jobLeads ?? []) {
        if (l.stage === "closed" || l.nextDate !== today || !l.nextStep.trim()) continue;
        push({
          key: `job:${l.id}:${today}`,
          title: `${l.company}: ${l.nextStep}`,
          body: l.role ? `${l.role} · today` : "Today",
          url: "/jobs",
          tag: `orbit-job-${l.id}`,
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

export type NotificationKind = EntityFields<"notifications">["kind"];

/** NOT-5 / NOT-3: what a sent notification is about, from its key, so the centre and actions know. */
export function notificationMeta(key: string): { kind: NotificationKind; ref: string | null } {
  const [prefix, ref] = key.split(":");
  switch (prefix) {
    case "plan":
    case "shutdown":
    case "review":
      return { kind: prefix, ref: null };
    case "habit":
      return { kind: "habit", ref: ref ?? null };
    case "reminder":
      return { kind: "reminder", ref: ref ?? null };
    case "date":
      return { kind: "date", ref: ref ?? null };
    case "job":
      return { kind: "job", ref: ref ?? null };
    case "qplan":
    case "qreview":
      return { kind: "quarter", ref: null };
    default:
      return { kind: "other", ref: null };
  }
}

/** NOT-3: the buttons a notification gets where the platform shows them. */
export function notificationActions(kind: NotificationKind): { action: string; title: string }[] {
  if (kind === "habit") return [{ action: "done", title: "Done" }];
  if (kind === "reminder") return [{ action: "snooze", title: "Snooze 15 min" }];
  return [];
}
