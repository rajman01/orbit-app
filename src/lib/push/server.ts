import "server-only";
import type { Db, Document } from "mongodb";
import * as webpush from "web-push";
import { dueNotifications, type Notification } from "@/features/reminders/model";
import { settingsId } from "@/features/settings/model";
import { addDays, dayOf } from "@/lib/dates";
import { env, pushEnabled } from "@/lib/env";

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
    const settings = await db
      .collection("settings")
      .findOne(live({ _id: settingsId(userId) as unknown as Document["_id"] }));
    if (!settings) continue;
    const tz = (settings.timezone as string) ?? "UTC";
    const today = dayOf(now, tz);
    const weekAgo = addDays(today, -7);
    const [rituals, cycles, habits, habitLogs, reminders, dueTodayCount, people, sent] = await Promise.all([
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
      sent: new Set(sent.map((s) => String(s._id).slice(userId.length + 1))),
    });
    if (due.length) users++;
    for (const n of due) {
      // Remember first, so an overlapping run can't send the same one twice.
      const claimed = await sentLog(db)
        .insertOne({ _id: `${userId}:${n.key}`, userId, at: new Date(now) })
        .then(() => true)
        .catch(() => false);
      if (!claimed) continue;
      await sendToUser(db, userId, { title: n.title, body: n.body, url: n.url, tag: n.tag }, send);
      notifications++;
    }
  }
  return { users, notifications };
}
