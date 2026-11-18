import "server-only";
import type { Db, Document } from "mongodb";
import * as webpush from "web-push";
import { dueNotifications, notificationActions, notificationMeta, type Notification } from "@/features/reminders/model";
import { settingsId } from "@/features/settings/model";
import { addDays, dayOf } from "@/lib/dates";
import { env, pushEnabled } from "@/lib/env";
import { recordNotification } from "@/lib/notifications/server";
import { jobSearchPaused, strongNewMatches } from "@/lib/jobs/server";

export interface StoredSubscription {
  _id: string; // the endpoint
  userId: string;
  keys: { p256dh: string; auth: string };
  userAgent: string | null;
  createdAt: Date;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** NOT-5: the notification centre entry, so opening or acting on it marks it read. */
  id?: string | null;
  /** NOT-3: buttons, where the platform shows them. */
  actions?: { action: string; title: string }[];
  /** PWA-6: the number to show on the app icon (null: leave it). */
  badge?: number | null;
}

/** Sends one push; `gone` means the subscription no longer exists and should be forgotten. */
export type Sender = (sub: StoredSubscription, payload: PushPayload) => Promise<{ ok: boolean; gone?: boolean }>;

const subs = (db: Db) => db.collection<StoredSubscription>("pushSubscriptions");
const sentLog = (db: Db) => db.collection<{ _id: string; userId: string; at: Date }>("sentNotifications");

let indexes: Promise<void> | undefined;
function ensureIndexes(db: Db) {
  indexes ??= (async () => {
    await subs(db).createIndex({ userId: 1 });
    // Remembered long enough to avoid repeats; a key never comes round again after 3 days.
    await sentLog(db).createIndex({ at: 1 }, { expireAfterSeconds: 3 * 24 * 3600 });
  })();
  return indexes;
}

export async function saveSubscription(
  db: Db,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
) {
  await ensureIndexes(db);
  await subs(db).updateOne(
    { _id: sub.endpoint },
    { $set: { userId, keys: sub.keys, userAgent }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

export async function removeSubscription(db: Db, userId: string, endpoint: string) {
  await subs(db).deleteOne({ _id: endpoint, userId });
}

export async function hasSubscription(db: Db, userId: string, endpoint: string) {
  return (await subs(db).countDocuments({ _id: endpoint, userId })) > 0;
}

let configured = false;
/** The real sender (VAPID). Null when push isn't configured. */
export function webPushSender(): Sender | null {
  if (!pushEnabled()) return null;
  if (!configured) {
    const e = env();
    webpush.setVapidDetails(e.VAPID_SUBJECT ?? "https://orbit.app", e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return async (sub, payload) => {
    try {
      await webpush.sendNotification({ endpoint: sub._id, keys: sub.keys }, JSON.stringify(payload), {
        TTL: 3600,
        urgency: "high",
        topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
      });
      return { ok: true };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      return { ok: false, gone: status === 404 || status === 410 };
    }
  };
}

/** Sends to every device of a user; forgets devices whose subscription has gone. */
export async function sendToUser(db: Db, userId: string, payload: PushPayload, send: Sender) {
  let sent = 0;
  for (const sub of await subs(db).find({ userId }).toArray()) {
    const res = await send(sub, payload);
    if (res.ok) sent++;
    else if (res.gone) await subs(db).deleteOne({ _id: sub._id });
  }
  return sent;
}

const live = <T extends Document>(filter: T) => ({ ...filter, deletedAt: null });

/** What's due for one user right now and not yet sent (features/reminders/model.ts), with the day's due-task count. */
export async function dueFor(db: Db, userId: string, now: number) {
  const settings = await db
    .collection("settings")
    .findOne(live({ _id: settingsId(userId) as unknown as Document["_id"] }));
  if (!settings) return null;
  const tz = (settings.timezone as string) ?? "UTC";
  const today = dayOf(now, tz);
  const weekAgo = addDays(today, -7);
  const [
    rituals,
    cycles,
    habits,
    habitLogs,
    reminders,
    dueTodayCount,
    people,
    quarters,
    jobLeads,
    routines,
    routineRuns,
    moneyToday,
    moneyRecent,
    debtsDue,
    sent,
  ] = await Promise.all([
    db
      .collection("rituals")
      .find(live({ userId, date: today }))
      .toArray(),
    db
      .collection("cycles")
      .find(live({ userId, endDate: today }))
      .toArray(),
    db
      .collection("habits")
      .find(live({ userId, archivedAt: null }))
      .toArray(),
    db
      .collection("habitLogs")
      .find(live({ userId, date: { $gte: weekAgo } }))
      .toArray(),
    db
      .collection("reminders")
      .find(live({ userId, status: "pending", fireAt: { $lte: now, $gte: now - 30 * 60_000 } }))
      .toArray(),
    db.collection("tasks").countDocuments(live({ userId, dueDate: today, status: { $nin: ["done", "cancelled"] } })),
    db
      .collection("people")
      .find(live({ userId, archivedAt: null, "dates.0": { $exists: true } }))
      .project({ name: 1, emoji: 1, color: 1, dates: 1, archivedAt: 1 })
      .toArray(),
    db
      .collection("quarters")
      .find(live({ userId, year: { $gte: Number(today.slice(0, 4)) } }))
      .project({ year: 1, q: 1, committedAt: 1, reviewCompletedAt: 1 })
      .toArray(),
    db
      .collection("jobLeads")
      .find(live({ userId, nextDate: today, stage: { $ne: "closed" } }))
      .project({ company: 1, role: 1, stage: 1, nextStep: 1, nextDate: 1 })
      .toArray(),
    db
      .collection("routines")
      .find(live({ userId, archivedAt: null, reminderTime: { $ne: null } }))
      .project({ name: 1, steps: 1, days: 1, reminderTime: 1, archivedAt: 1 })
      .toArray(),
    db
      .collection("routineRuns")
      .find(live({ userId, date: today }))
      .project({ routineId: 1, date: 1, doneStepIds: 1, skippedStepIds: 1, completedAt: 1 })
      .toArray(),
    db.collection("transactions").countDocuments(live({ userId, date: today })),
    db.collection("transactions").countDocuments(live({ userId, date: { $gte: addDays(today, -30) } })),
    db
      .collection("debts")
      .find(live({ userId, direction: "owe", closedAt: null, archivedAt: null, dueDay: Number(today.slice(8, 10)) }))
      .project({ name: 1, minimumPayment: 1 })
      .toArray(),
    sentLog(db).find({ userId }).project({ _id: 1 }).toArray(),
  ]);
  const due: Notification[] = dueNotifications({
    now,
    settings: settings as never,
    rituals: rituals as never,
    cycles: cycles.map((c) => ({ ...c, id: String(c._id) })) as never,
    habits: habits.map((h) => ({ ...h, id: String(h._id) })) as never,
    habitLogs: habitLogs as never,
    reminders: reminders.map((r) => ({ ...r, id: String(r._id) })) as never,
    dueTodayCount,
    people: people.map((p) => ({ ...p, id: String(p._id) })) as never,
    quarters: quarters as never,
    jobLeads: jobLeads.map((l) => ({ ...l, id: String(l._id) })) as never,
    routines: routines.map((r) => ({ ...r, id: String(r._id) })) as never,
    routineRuns: routineRuns as never,
    money: { today: moneyToday, recent: moneyRecent },
    incomeDue: (
      (settings.money as { incomes?: { id: string; name: string; amount: number; day: number | null }[] } | undefined)
        ?.incomes ?? []
    )
      .filter((i) => i.day === Number(today.slice(8, 10)))
      .map((i) => ({
        id: i.id,
        name: i.name,
        amount: i.amount,
        currency: (settings.currency as string | undefined) ?? "NGN",
      })),
    debtsDue: debtsDue.map((d) => ({
      id: String(d._id),
      name: String(d.name),
      amount: (d.minimumPayment as number | null) ?? null,
      currency: (settings.currency as string | undefined) ?? "NGN",
    })),
    // 3D.4: no morning push while the search is paused.
    jobsFound: (await jobSearchPaused(db, userId, today))
      ? []
      : await strongNewMatches(db, userId, now - 24 * 3_600_000),
    sent: new Set(sent.map((s) => String(s._id).slice(userId.length + 1))),
  });
  return { due, settings, today, timezone: tz, dueTodayCount };
}

/** Remembers a notification as sent (first, so an overlapping run can't send it twice). False if it already was. */
export function claimSent(db: Db, userId: string, key: string, now: number) {
  return sentLog(db)
    .insertOne({ _id: `${userId}:${key}`, userId, at: new Date(now) })
    .then(() => true)
    .catch(() => false);
}

/** PWA-6: the number for the app icon — unread notifications, or tasks due today, or none. */
export async function badgeCount(db: Db, userId: string, mode: string | undefined, dueTodayCount: number) {
  if (mode === "off") return 0;
  if (mode === "due") return dueTodayCount;
  return db.collection("notifications").countDocuments({ userId, deletedAt: null, readAt: null });
}

/**
 * The per-minute job (PRD §12, NOT-6): for each user with a device signed up for push, work out
 * what's due now (features/reminders/model.ts), send it, and remember it so it's sent once.
 */
export async function dispatchReminders(db: Db, now: number, send: Sender) {
  await ensureIndexes(db);
  const userIds = await subs(db).distinct("userId");
  let users = 0;
  let notifications = 0;
  for (const userId of userIds) {
    const ctx = await dueFor(db, userId, now);
    if (!ctx) continue;
    if (ctx.due.length) users++;
    for (const n of ctx.due) {
      if (!(await claimSent(db, userId, n.key, now))) continue;
      // NOT-5: in the notification centre too, whether or not a device shows it.
      const id = await recordNotification(db, userId, n, now).catch(() => null);
      const actions = notificationActions(notificationMeta(n.key).kind);
      // PWA-6: the app icon's number, set by the service worker when the push arrives.
      const badge = await badgeCount(
        db,
        userId,
        (ctx.settings.badge as string | undefined) ?? "unread",
        ctx.dueTodayCount,
      ).catch(() => null);
      await sendToUser(db, userId, { title: n.title, body: n.body, url: n.url, tag: n.tag, id, actions, badge }, send);
      notifications++;
    }
  }
  return { users, notifications };
}
