import "server-only";
import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { feedIcs } from "./ics";

/**
 * CAL-3: one secret feed link per user. The token is the only thing protecting the feed, so it's
 * long and random, and resetting it makes the old link stop working at once.
 */
interface Feed {
  _id: string; // the token
  userId: string;
  createdAt: number;
}

const feeds = (db: Db) => db.collection<Feed>("calendarFeeds");
export const FEED_TOKEN = /^[A-Za-z0-9_-]{40,60}$/;

export async function feedToken(db: Db, userId: string): Promise<string> {
  const existing = await feeds(db).findOne({ userId });
  if (existing) return existing._id;
  const _id = randomBytes(32).toString("base64url");
  await feeds(db).insertOne({ _id, userId, createdAt: Date.now() });
  return _id;
}

export async function resetFeed(db: Db, userId: string): Promise<string> {
  await feeds(db).deleteMany({ userId });
  return feedToken(db, userId);
}

const DAY = 86_400_000;

/** The feed for a token: blocks from a month back to six months ahead, open dated tasks. */
export async function feedFor(db: Db, token: string, now = Date.now()): Promise<string | null> {
  if (!FEED_TOKEN.test(token)) return null;
  const feed = await feeds(db).findOne({ _id: token });
  if (!feed) return null;
  const { userId } = feed;
  const blocks = await db
    .collection("timeBlocks")
    .find({ userId, deletedAt: null, end: { $gte: now - 30 * DAY }, start: { $lt: now + 180 * DAY } })
    .project({ _id: 1, title: 1, start: 1, end: 1 })
    .toArray();
  const tasks = await db
    .collection("tasks")
    .find({
      userId,
      deletedAt: null,
      status: { $nin: ["done", "cancelled"] },
      parentTaskId: null,
      $or: [{ scheduledDate: { $ne: null } }, { dueDate: { $ne: null } }],
    })
    .project({ _id: 1, title: 1, scheduledDate: 1, dueDate: 1 })
    .limit(1000)
    .toArray();
  return feedIcs(
    blocks.map((b) => ({ id: String(b._id), title: String(b.title), start: Number(b.start), end: Number(b.end) })),
    tasks.map((t) => ({
      id: String(t._id),
      title: String(t.title),
      day: String(t.scheduledDate ?? t.dueDate),
      due: t.scheduledDate == null,
    })),
    now,
  );
}
