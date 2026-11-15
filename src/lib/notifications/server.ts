import "server-only";
import type { Db } from "mongodb";
import { ulid } from "ulid";
import { habitLogId, habitStatus } from "@/features/habits/model";
import { notificationMeta, type Notification } from "@/features/reminders/model";
import { settingsId } from "@/features/settings/model";
import { habitXp, xpEventId } from "@/features/xp/model";
import { addDays, dayOf } from "@/lib/dates";
import type { Mutation } from "@/lib/sync/protocol";
import { applyMutations } from "@/lib/sync/server";

/**
 * NOT-5: each notification sent is recorded as synced data, so the notification centre on every
 * device shows it. Devices may only mark it read (DEVICE_WRITABLE).
 */
export async function recordNotification(db: Db, userId: string, n: Notification, now: number) {
  const id = ulid(now);
  const meta = notificationMeta(n.key);
  const res = await applyMutations(
    db,
    userId,
    [
      {
        mutationId: ulid(),
        entity: "notifications",
        entityId: id,
        op: "upsert",
        fields: {
          title: n.title.slice(0, 200),
          body: n.body.slice(0, 500),
          url: n.url.slice(0, 300),
          tag: n.tag.slice(0, 100),
          kind: meta.kind,
          ref: meta.ref,
          sentAt: now,
          readAt: null,
        },
        clientTime: now,
      },
    ],
    { trusted: true },
  );
  // The centre keeps 60 days; older entries are removed as new ones arrive.
  const old = await db
    .collection("notifications")
    .find({ userId, deletedAt: null, sentAt: { $lt: now - KEEP_MS } })
    .project({ _id: 1 })
    .limit(50)
    .toArray();
  if (old.length)
    await applyMutations(
      db,
      userId,
      old.map((o) => ({
        mutationId: ulid(),
        entity: "notifications" as const,
        entityId: String(o._id),
        op: "delete" as const,
        clientTime: now,
      })),
      { trusted: true },
    );
  return res.applied.length ? id : null;
}

export const KEEP_MS = 60 * 24 * 3600_000;

const upsert = (entity: Mutation["entity"], entityId: string, fields: Record<string, unknown>, now: number) =>
  ({ mutationId: ulid(), entity, entityId, op: "upsert", fields, clientTime: now }) satisfies Mutation;

export const SNOOZE_MS = 15 * 60_000;

/**
 * NOT-3: a button pressed on a notification (or the notification opened). "done" logs a habit
 * for today (with its XP, as the app would); "snooze" moves a reminder 15 minutes on. Both mark
 * the notification read.
 */
export async function notificationAction(
  db: Db,
  userId: string,
  input: { id?: string | null; action: "open" | "done" | "snooze" },
  now = Date.now(),
): Promise<{ ok: boolean; error?: string }> {
  const live = { userId, deletedAt: null };
  const note = input.id ? await db.collection("notifications").findOne({ ...live, _id: input.id as never }) : null;
  if (input.id && !note) return { ok: false, error: "not found" };
  const mutations: Mutation[] = [];
  if (note && note.readAt == null) mutations.push(upsert("notifications", input.id!, { readAt: now }, now));

  if (input.action === "done") {
    if (note?.kind !== "habit" || !note.ref) return { ok: false, error: "not a habit" };
    const habit = await db.collection("habits").findOne({ ...live, _id: note.ref as never });
    if (!habit || habit.archivedAt != null) return { ok: false, error: "habit gone" };
    const settings = await db.collection("settings").findOne({ ...live, _id: settingsId(userId) as never });
    const tz = (settings?.timezone as string | undefined) ?? "UTC";
    const today = dayOf(now, tz);
    const logId = habitLogId(note.ref, today);
    const value = habit.targetType === "boolean" ? 1 : Number(habit.targetCount);
    const logs = (
      await db
        .collection("habitLogs")
        .find({ ...live, habitId: note.ref, date: { $gte: addDays(today, -400) } })
        .project({ date: 1, value: 1 })
        .toArray()
    )
      .filter((l) => l.date !== today)
      .map((l) => ({ date: String(l.date), value: Number(l.value) }));
    logs.push({ date: today, value });
    const status = habitStatus(habit as never, logs, today, {
      weekStart: Number(settings?.weekStartDay ?? 1),
      startDay: dayOf(Number(habit.createdAt), tz),
    });
    const streakDays = status.unit === "week" ? status.streak * 7 : status.streak;
    mutations.push(upsert("habitLogs", logId, { habitId: note.ref, date: today, value, note: null }, now));
    mutations.push(
      upsert(
        "xpEvents",
        xpEventId("habit", logId),
        {
          source: "habit",
          sourceId: logId,
          areaId: (habit.areaId as string | null) ?? null,
          amount: habitXp(streakDays),
          reason: `Habit: ${String(habit.name)}`.slice(0, 200),
          at: now,
        },
        now,
      ),
    );
  }

  if (input.action === "snooze") {
    if (note?.kind !== "reminder" || !note.ref) return { ok: false, error: "not a reminder" };
    const reminder = await db.collection("reminders").findOne({ ...live, _id: note.ref as never });
    if (!reminder) return { ok: false, error: "reminder gone" };
    mutations.push(upsert("reminders", note.ref, { fireAt: now + SNOOZE_MS, status: "pending" }, now));
  }

  if (!mutations.length) return { ok: true };
  const res = await applyMutations(db, userId, mutations);
  return res.rejected.length ? { ok: false, error: res.rejected[0].reason } : { ok: true };
}
