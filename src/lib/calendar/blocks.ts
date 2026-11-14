import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { eventFields, WINDOW_BACK_DAYS } from "@/features/calendar/model";
import { google, GoogleNotFound, type EventBody, type GoogleEvent } from "./google";
import type { Mutation } from "@/lib/sync/protocol";

/**
 * Phase 2B.2 time blocks on the calendar (CAL-1, CAL-4). Blocks are made in Orbit (any device, even
 * offline) and mirrored by the server to an "Orbit" calendar it creates in the user's chosen account.
 * A block moved, renamed or deleted there comes back. Each sync first pulls the Orbit calendar's
 * changes (applied with Google's change time, so the newer edit wins field by field), then pushes
 * every block that changed in Orbit since the last push and differs from what Google has.
 */

export interface BlockLink {
  /** The time block's id. */
  _id: string;
  userId: string;
  accountId: string;
  calendarId: string;
  eventId: string;
  /** What Google has, as of the last push or pull. */
  title: string;
  start: number;
  end: number;
}

export const blockLinks = (db: Db) => db.collection<BlockLink>("calendarBlockLinks");

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const BLOCK_ID = /^[0-9A-Za-z]{10,40}$/;
export const ORBIT_CALENDAR_NAME = "Orbit";
/** Blocks pushed per sync; the rest go on the next run. */
const PUSH_BATCH = 100;

interface Account {
  _id: string;
  userId: string;
  orbitCalendarId?: string | null;
  blocksCursor?: number;
  createdAt: number;
}

interface Ctx {
  db: Db;
  account: Account;
  token: string;
  now: number;
  /** Google calendar ids the account has right now. */
  remoteIds: Set<string>;
  /** The account's sync tokens (updated in place for the Orbit calendar). */
  syncTokens: Record<string, string>;
  write: (mutations: Mutation[]) => Promise<void>;
  upsert: (entity: Mutation["entity"], id: string, fields: Record<string, unknown>, at: number) => Mutation;
  remove: (entity: Mutation["entity"], id: string, at: number) => Mutation;
  calendarDocId: (googleCalendarId: string) => string;
}

/** The account blocks go to: the one chosen in Settings, else the first connected. */
export async function blocksAccountId(db: Db, userId: string): Promise<string | null> {
  const list = await db
    .collection<Account>("calendarAccounts")
    .find({ userId })
    .project<{ _id: string }>({ _id: 1 })
    .sort({ createdAt: 1 })
    .toArray();
  if (!list.length) return null;
  const settings = await db.collection("settings").findOne({ userId, deletedAt: null });
  const chosen = typeof settings?.blocksAccountId === "string" ? settings.blocksAccountId : null;
  return list.some((a) => a._id === chosen) ? chosen : list[0]._id;
}

async function userTimezone(db: Db, userId: string) {
  const s = await db.collection("settings").findOne({ userId, deletedAt: null });
  return typeof s?.timezone === "string" ? s.timezone : "UTC";
}

/**
 * Pull, then push. Returns `more` when blocks are still waiting (the job comes back next minute).
 */
export async function syncBlocks(ctx: Ctx): Promise<{ more: boolean }> {
  const { db, account } = ctx;
  let calId = account.orbitCalendarId ?? null;
  let cursor = account.blocksCursor ?? 0;
  if (calId && !ctx.remoteIds.has(calId)) {
    // The Orbit calendar was deleted in Google: start over with a new one, pushing every block again.
    await blockLinks(db).deleteMany({ userId: account.userId, accountId: account._id });
    delete ctx.syncTokens[calId];
    calId = null;
    cursor = 0;
    await db
      .collection<Account>("calendarAccounts")
      .updateOne({ _id: account._id }, { $set: { orbitCalendarId: null, blocksCursor: 0 } });
  }
  if (calId) ctx.syncTokens[calId] = await pull(ctx, calId, ctx.syncTokens[calId]);
  return push(ctx, calId, cursor);
}

/** Changes made in Google to the Orbit calendar's events. */
async function pull(ctx: Ctx, calId: string, syncToken: string | undefined): Promise<string> {
  const { token, now } = ctx;
  const g = google();
  const changes: Mutation[] = [];
  let pageToken: string | undefined;
  let next = syncToken ?? "";
  const timeMin = new Date(now - WINDOW_BACK_DAYS * 86_400_000).toISOString();
  const timeMax = new Date(now + 366 * 86_400_000).toISOString();
  do {
    const page = await g.listEvents(token, calId, { syncToken, pageToken, timeMin, timeMax });
    for (const e of page.items) await pullOne(ctx, calId, e, changes);
    pageToken = page.nextPageToken;
    if (page.nextSyncToken) next = page.nextSyncToken;
  } while (pageToken);
  await ctx.write(changes);
  return next;
}

async function pullOne(ctx: Ctx, calId: string, e: GoogleEvent, changes: Mutation[]) {
  const { db, account, now } = ctx;
  const links = blockLinks(db);
  const at = Math.min(Date.parse(e.updated ?? "") || now, now);
  const link = await links.findOne({ userId: account.userId, accountId: account._id, eventId: e.id });
  const f = eventFields(e, "orbit");
  if (!f || f.allDay) {
    // Cancelled (deleted in Google), or turned into an all-day event: the block goes.
    if (link) {
      changes.push(ctx.remove("timeBlocks", link._id, at));
      await links.deleteOne({ _id: link._id });
    }
    return;
  }
  const fields = { title: f.title === "(No title)" ? "Time block" : f.title, start: f.start, end: f.end };
  if (link) {
    if (link.title === fields.title && link.start === fields.start && link.end === fields.end) return;
    changes.push(ctx.upsert("timeBlocks", link._id, fields, at));
    await links.updateOne({ _id: link._id }, { $set: fields });
    return;
  }
  // An event Orbit doesn't know: one it wrote whose link was lost, or one made in Google directly.
  const claimed = e.extendedProperties?.private?.orbitBlockId;
  const id = claimed && BLOCK_ID.test(claimed) ? claimed : `tb${hash(`${account._id}:${e.id}`).slice(0, 30)}`;
  const existing = await db.collection("timeBlocks").findOne({ _id: id as never });
  if (existing && existing.userId !== account.userId) return;
  if (existing?.deletedAt) {
    await google().deleteEvent(ctx.token, calId, e.id);
    return;
  }
  changes.push(ctx.upsert("timeBlocks", id, existing ? fields : { taskId: null, ...fields }, at));
  await links.updateOne(
    { _id: id },
    { $set: { userId: account.userId, accountId: account._id, calendarId: calId, eventId: e.id, ...fields } },
    { upsert: true },
  );
}

/** Blocks changed in Orbit since the last push. */
async function push(ctx: Ctx, calId: string | null, cursor: number): Promise<{ more: boolean }> {
  const { db, account, token, now } = ctx;
  const g = google();
  const links = blockLinks(db);
  const changed = await db
    .collection("timeBlocks")
    .find({ userId: account.userId, serverVersion: { $gt: cursor } })
    .sort({ serverVersion: 1 })
    .limit(PUSH_BATCH)
    .toArray();
  if (!changed.length) return { more: false };
  const timeZone = await userTimezone(db, account.userId);
  const oldest = now - WINDOW_BACK_DAYS * 86_400_000;

  for (const b of changed) {
    const blockId = String(b._id);
    const link = await links.findOne({ _id: blockId });
    try {
      if (b.deletedAt) {
        if (link) {
          await g.deleteEvent(token, link.calendarId, link.eventId);
          await links.deleteOne({ _id: blockId });
        }
        continue;
      }
      if (b.end < oldest) continue;
      const fields = { title: String(b.title), start: Number(b.start), end: Number(b.end) };
      if (link?.accountId === account._id) {
        if (link.title === fields.title && link.start === fields.start && link.end === fields.end) continue;
      }
      const body: EventBody = {
        summary: fields.title,
        description: "Time blocked in Orbit.",
        start: { dateTime: new Date(fields.start).toISOString(), timeZone },
        end: { dateTime: new Date(fields.end).toISOString(), timeZone },
        extendedProperties: { private: { orbitBlockId: blockId } },
      };
      calId ??= await createOrbitCalendar(ctx, timeZone);
      let event: GoogleEvent | null = null;
      if (link?.accountId === account._id) {
        event = await g.patchEvent(token, link.calendarId, link.eventId, body).catch((err) => {
          if (err instanceof GoogleNotFound) return null; // deleted there meanwhile: write it again
          throw err;
        });
      }
      event ??= await g.insertEvent(token, calId, body);
      await links.updateOne(
        { _id: blockId },
        {
          $set: {
            userId: account.userId,
            accountId: account._id,
            calendarId: link?.accountId === account._id ? link.calendarId : calId,
            eventId: event.id,
            ...fields,
          },
        },
        { upsert: true },
      );
    } catch (err) {
      // One bad block mustn't hold up the rest; it's retried when it next changes.
      console.error("time block push failed", blockId, err);
    }
  }
  await db
    .collection<Account>("calendarAccounts")
    .updateOne({ _id: account._id }, { $set: { blocksCursor: Number(changed[changed.length - 1].serverVersion) } });
  return { more: changed.length === PUSH_BATCH };
}

async function createOrbitCalendar(ctx: Ctx, timeZone: string): Promise<string> {
  const { db, account, token, now } = ctx;
  const { id } = await google().insertCalendar(token, ORBIT_CALENDAR_NAME, timeZone);
  await db.collection<Account>("calendarAccounts").updateOne({ _id: account._id }, { $set: { orbitCalendarId: id } });
  account.orbitCalendarId = id;
  ctx.remoteIds.add(id);
  await ctx.write([
    ctx.upsert(
      "calendars",
      ctx.calendarDocId(id),
      {
        accountId: account._id,
        provider: "google",
        name: ORBIT_CALENDAR_NAME,
        color: "#ff9500",
        selected: true,
        isOrbit: true,
        readOnly: false,
      },
      now,
    ),
  ]);
  return id;
}
