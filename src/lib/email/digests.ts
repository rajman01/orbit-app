import "server-only";
import { ObjectId, type Db, type Document } from "mongodb";
import { startOfWeek, timeOfDay } from "@/features/cycles/model";
import { defaultSettings } from "@/features/settings/model";
import { skipReasonLabel } from "@/features/today/model";
import { addDays, dayOf } from "@/lib/dates";
import { DEFAULT_CURRENCY, formatMoney, rangeSummary, type Transaction } from "@/features/money/model";
import { recordNotification } from "@/lib/notifications/server";
import { claimSent, dueFor } from "@/lib/push/server";
import { emailConfigured, layout, sendEmail } from "./send";

/**
 * Phase 3E (NOT-7): the weekly report by email (the last evening of your week), and important
 * reminders by email for people with no device signed up for push — bundled, at most twice a day,
 * to stay well inside the free sending plan.
 */

/** Reminder kinds worth an email: reviews, quarter planning, important dates, job steps and strong new roles. */
const IMPORTANT = /^(review|qplan|qreview|date|job|jobsfound):/;
export const REMINDER_EMAILS_PER_DAY = 2;

const appUrl = () => (process.env.BETTER_AUTH_URL ?? "https://startorbit.app").replace(/\/$/, "");
const live = <T extends Document>(filter: T) => ({ ...filter, deletedAt: null });

async function emailOf(db: Db, userId: string): Promise<string | null> {
  const id = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
  const user = await db.collection("user").findOne({ _id: id as never });
  const email = user?.email as string | undefined;
  return email && /@/.test(email) ? email : null;
}

export interface WeekSummary {
  from: string;
  to: string;
  done: { title: string; points: number }[];
  points: number;
  focusHours: number;
  xp: number;
  plans: number;
  shutdowns: number;
  days: number;
  wins: string[];
  skips: number;
  topSkip: string | null;
  applied: number;
  /** 5B: the week's money, when any was logged. */
  money: { spent: string; received: string; top: string | null } | null;
}

/** What happened in a week (from..to, inclusive), from the server's copy of the data. */
export async function weekSummary(db: Db, userId: string, from: string, to: string, tz: string): Promise<WeekSummary> {
  const start = Date.parse(`${addDays(from, -1)}T00:00:00Z`);
  const end = Date.parse(`${addDays(to, 2)}T00:00:00Z`);
  const inWeek = (ms: number | null | undefined) => {
    if (ms == null) return false;
    const d = dayOf(ms, tz);
    return d >= from && d <= to;
  };
  const [tasks, sessions, xp, rituals, wins, events, leads, transactions, categories, settings] = await Promise.all([
    db
      .collection("tasks")
      .find(live({ userId, status: "done", completedAt: { $gte: start, $lt: end }, parentTaskId: null }))
      .toArray(),
    db
      .collection("focusSessions")
      .find(live({ userId, startedAt: { $gte: start, $lt: end } }))
      .toArray(),
    db
      .collection("xpEvents")
      .find(live({ userId, at: { $gte: start, $lt: end } }))
      .toArray(),
    db
      .collection("rituals")
      .find(live({ userId, date: { $gte: from, $lte: to }, completedAt: { $ne: null } }))
      .toArray(),
    db
      .collection("wins")
      .find(live({ userId, date: { $gte: from, $lte: to } }))
      .toArray(),
    db
      .collection("taskEvents")
      .find(live({ userId, type: "skip", at: { $gte: start, $lt: end } }))
      .toArray(),
    db
      .collection("jobLeads")
      .find(live({ userId, appliedAt: { $gte: start, $lt: end } }))
      .toArray(),
    db
      .collection("transactions")
      .find(live({ userId, date: { $gte: from, $lte: to } }))
      .toArray(),
    db.collection("categories").find(live({ userId })).project({ name: 1 }).toArray(),
    db.collection("settings").findOne(live({ userId })),
  ]);
  const currency = (settings?.currency as string | undefined) ?? DEFAULT_CURRENCY;
  const money = (() => {
    if (!transactions.length) return null;
    const r = rangeSummary(
      transactions.map((t) => ({ ...t, id: String(t._id) })) as unknown as Transaction[],
      from,
      to,
    );
    const topName = r.topCategoryId ? categories.find((c) => String(c._id) === r.topCategoryId)?.name : null;
    return {
      spent: formatMoney(r.expense, currency, { compact: true }),
      received: formatMoney(r.income, currency, { compact: true }),
      top: topName ? String(topName) : null,
    };
  })();
  const done = tasks
    .filter((t) => inWeek(t.completedAt as number))
    .sort((a, b) => (b.effort ?? 0) - (a.effort ?? 0))
    .map((t) => ({ title: String(t.title), points: Number(t.effort ?? 0) }));
  const skips = events.filter((e) => inWeek(e.at as number));
  const reasons = new Map<string, number>();
  for (const e of skips) if (e.reason) reasons.set(String(e.reason), (reasons.get(String(e.reason)) ?? 0) + 1);
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    from,
    to,
    done,
    points: done.reduce((n, t) => n + t.points, 0),
    focusHours:
      Math.round(
        (sessions.filter((s) => inWeek(s.startedAt as number)).reduce((n, s) => n + Number(s.actualMinutes ?? 0), 0) /
          60) *
          10,
      ) / 10,
    xp: xp.filter((e) => inWeek(e.at as number)).reduce((n, e) => n + Number(e.amount ?? 0), 0),
    plans: rituals.filter((r) => r.type === "daily_plan").length,
    shutdowns: rituals.filter((r) => r.type === "daily_shutdown").length,
    days: 7,
    wins: wins.map((w) => String(w.title)).slice(0, 5),
    skips: skips.length,
    topSkip: top ? (skipReasonLabel(top[0]) ?? top[0]) : null,
    applied: leads.filter((l) => inWeek(l.appliedAt as number)).length,
    money,
  };
}

const fmt = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    Date.parse(`${d}T12:00:00Z`),
  );

export function weeklyReportEmail(s: WeekSummary, to: string) {
  const quiet = !s.done.length && !s.focusHours && !s.plans;
  const sections: { title: string; lines: string[] }[] = [];
  sections.push({
    title: "The week in numbers",
    lines: [
      `${s.done.length} task${s.done.length === 1 ? "" : "s"} done${s.points ? ` (${s.points} points)` : ""}`,
      `${s.focusHours} hour${s.focusHours === 1 ? "" : "s"} of focus`,
      `Daily plan on ${s.plans} of ${s.days} days, shutdown on ${s.shutdowns}`,
      `${s.xp} XP earned`,
      ...(s.applied ? [`${s.applied} job application${s.applied === 1 ? "" : "s"} sent`] : []),
      ...(s.money
        ? [`Spent ${s.money.spent}, received ${s.money.received}${s.money.top ? `, mostly on ${s.money.top}` : ""}`]
        : []),
    ],
  });
  if (s.done.length)
    sections.push({
      title: "Done",
      lines: s.done
        .slice(0, 8)
        .map((t) => t.title)
        .concat(s.done.length > 8 ? [`and ${s.done.length - 8} more`] : []),
    });
  if (s.wins.length) sections.push({ title: "Wins", lines: s.wins });
  if (s.skips)
    sections.push({
      title: "Put off",
      lines: [`${s.skips} skip${s.skips === 1 ? "" : "s"}${s.topSkip ? `, mostly “${s.topSkip}”` : ""}`],
    });
  const { html, text } = layout({
    heading: `Your week, ${fmt(s.from)} – ${fmt(s.to)}`,
    intro: quiet ? "A quiet week in Orbit. Next week starts fresh: plan tomorrow's first Must-do tonight." : undefined,
    sections,
    button: { label: "See the full report", url: `${appUrl()}/report` },
    footer: "You get this because the weekly report email is on. Turn it off in Orbit: Settings → Notifications.",
  });
  return {
    to,
    subject: `Your week in Orbit: ${s.done.length} done, ${s.focusHours}h focus`,
    text,
    html,
    tag: "weekly-report",
  };
}

/** The per-minute job's email part. Returns how many emails went out. */
export async function dispatchEmails(db: Db, now: number) {
  if (!emailConfigured()) return { emails: 0 };
  let emails = 0;
  const users = await db
    .collection("settings")
    .find({ deletedAt: null })
    .project({ userId: 1, timezone: 1, weekStartDay: 1, ritualTimes: 1, email: 1 })
    .toArray();
  const pushUsers = new Set((await db.collection("pushSubscriptions").distinct("userId")).map(String));
  for (const s of users) {
    const userId = String(s.userId);
    const prefs = { ...defaultSettings().email!, ...(s.email ?? {}) };
    if (!prefs.weeklyReport && !prefs.reminders) continue;
    const tz = (s.timezone as string) ?? "UTC";
    const today = dayOf(now, tz);
    const time = timeOfDay(now, tz);

    // The weekly report: the week's last day, from the evening Shutdown time.
    if (prefs.weeklyReport) {
      const weekStart = startOfWeek(today, Number(s.weekStartDay ?? 0));
      const lastDay = addDays(weekStart, 6);
      const shutdown = (s.ritualTimes?.shutdown as string | undefined) ?? defaultSettings().ritualTimes!.shutdown;
      if (today === lastDay && time >= shutdown && (await claimSent(db, userId, `email:weekly:${weekStart}`, now))) {
        const to = await emailOf(db, userId);
        if (to) {
          const r = await sendEmail(db, weeklyReportEmail(await weekSummary(db, userId, weekStart, lastDay, tz), to));
          if (r.ok) emails++;
          else console.error("weekly report email failed", r.error);
        }
      }
    }

    // Important reminders, only for people without push.
    if (prefs.reminders && !pushUsers.has(userId)) {
      const ctx = await dueFor(db, userId, now);
      const important = (ctx?.due ?? []).filter((n) => IMPORTANT.test(n.key));
      if (!important.length) continue;
      const sentToday = await db
        .collection("sentNotifications")
        .countDocuments({ _id: { $regex: `^${userId}:email:reminders:${today}:` } as never });
      if (sentToday >= REMINDER_EMAILS_PER_DAY) continue;
      const fresh = [];
      for (const n of important) if (await claimSent(db, userId, n.key, now)) fresh.push(n);
      if (!fresh.length) continue;
      await claimSent(db, userId, `email:reminders:${today}:${sentToday + 1}`, now);
      for (const n of fresh) await recordNotification(db, userId, n, now).catch(() => null);
      const to = await emailOf(db, userId);
      if (!to) continue;
      const { html, text } = layout({
        heading: fresh.length === 1 ? fresh[0].title : `${fresh.length} things from Orbit`,
        sections: [{ title: "Today", lines: fresh.map((n) => (n.body ? `${n.title}: ${n.body}` : n.title)) }],
        button: { label: "Open Orbit", url: `${appUrl()}${fresh[0].url}` },
        footer:
          "You get these because notifications aren't on for any of your devices. Turn on notifications in Orbit (Settings → Notifications) for reminders on your phone instead, or turn these emails off there.",
      });
      const r = await sendEmail(db, {
        to,
        subject: fresh.length === 1 ? fresh[0].title : `${fresh.length} reminders from Orbit`,
        text,
        html,
        tag: "reminders",
      });
      if (r.ok) emails++;
      else console.error("reminder email failed", r.error);
    }
  }
  return { emails };
}
