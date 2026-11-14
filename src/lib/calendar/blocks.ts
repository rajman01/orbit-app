import "server-only";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { eventFields, WINDOW_BACK_DAYS } from "@/features/calendar/model";
import { caldav, CaldavNotFound, type CaldavCreds } from "./caldav";
import { google, GoogleNotFound, type EventBody } from "./google";
import { blockIcs, blockUid, parseEvents } from "./ics";
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

/** An event in the Orbit calendar, as either provider reports it. */
export interface RemoteBlockEvent {
  id: string;
  /** Deleted there, or no longer a timed event. */
  gone: boolean;
  title: string;
  start: number;
  end: number;
  updated: number | null;
  orbitBlockId: string | null;
}

interface BlockFields {
  id: string;
  title: string;
  start: number;
  end: number;
}

/** What block syncing needs from a calendar provider. */
export interface BlockRemote {
  provider: "google" | "caldav";
  /**
   * Changes in the Orbit calendar since `state`. `complete`: the list is everything in the window,
   * so a linked event that isn't in it was deleted.
   */
  pull(
    calId: string,
    state: string | undefined,
    from: number,
    to: number,
  ): Promise<{
    events: RemoteBlockEvent[];
    complete: boolean;
    next: string;
  }>;
  createCalendar(name: string, color: string, timeZone: string): Promise<string>;
  /** Writes the block; returns the event id (`existing` when updating, null when it was gone). */
  write(calId: string, block: BlockFields, timeZone: string, existing: string | null): Promise<string | null>;
  remove(calId: string, eventId: string): Promise<void>;
}

export function googleBlocks(token: string): BlockRemote {
  const g = google();
  const body = (b: BlockFields, timeZone: string): EventBody => ({
    summary: b.title,
    description: "Time blocked in Orbit.",
    start: { dateTime: new Date(b.start).toISOString(), timeZone },
    end: { dateTime: new Date(b.end).toISOString(), timeZone },
    extendedProperties: { private: { orbitBlockId: b.id } },
  });
  return {
    provider: "google",
    async pull(calId, syncToken, from, to) {
      const events: RemoteBlockEvent[] = [];
      let pageToken: string | undefined;
      let next = syncToken ?? "";
      do {
        const page = await g.listEvents(token, calId, {
          syncToken,
          pageToken,
          timeMin: new Date(from).toISOString(),
          timeMax: new Date(to).toISOString(),
        });
        for (const e of page.items) {
          const f = eventFields(e, "orbit");
          events.push({
            id: e.id,
            gone: !f || f.allDay,
            title: f?.title ?? "",
            start: f?.start ?? 0,
            end: f?.end ?? 0,
            updated: Date.parse(e.updated ?? "") || null,
            orbitBlockId: e.extendedProperties?.private?.orbitBlockId ?? null,
          });
        }
        pageToken = page.nextPageToken;
        if (page.nextSyncToken) next = page.nextSyncToken;
      } while (pageToken);
      return { events, complete: false, next };
    },
    createCalendar: async (name, _color, timeZone) => (await g.insertCalendar(token, name, timeZone)).id,
    async write(calId, b, timeZone, existing) {
      if (existing) {
        const e = await g.patchEvent(token, calId, existing, body(b, timeZone)).catch((err) => {
          if (err instanceof GoogleNotFound) return null;
          throw err;
        });
        return e ? e.id : null;
      }
      return (await g.insertEvent(token, calId, body(b, timeZone))).id;
    },
    remove: (calId, eventId) => g.deleteEvent(token, calId, eventId),
  };
}

/** iCloud: the Orbit calendar is read whole (it only holds blocks) when its ctag changes. */
export function caldavBlocks(creds: CaldavCreds, homeUrl: string, fallbackTz: string): BlockRemote {
  const d = caldav();
  return {
    provider: "caldav",
    async pull(calId, ctag, from, to) {
      const cal = (await d.listCalendars(creds, homeUrl)).find((c) => c.url === calId);
      const tag = `${cal?.ctag ?? ""}|${new Date().toISOString().slice(0, 10)}`;
      if (cal?.ctag && ctag === tag) return { events: [], complete: false, next: tag };
      const objects = await d.listEvents(creds, calId, from, to);
      const events: RemoteBlockEvent[] = [];
      for (const o of objects) {
        const parsed = parseEvents(o.ics, from, to, fallbackTz);
        const e = parsed.find((x) => !x.allDay);
        events.push({
          id: o.href,
          gone: !e,
          title: e?.title ?? "",
          start: e?.start ?? 0,
          end: e?.end ?? 0,
          updated: e?.updated ?? null,
          orbitBlockId: e?.orbitBlockId ?? null,
        });
      }
      return { events, complete: true, next: tag };
    },
    createCalendar: (name, color) => d.makeCalendar(creds, homeUrl, name, color),
    async write(calId, b, _timeZone, existing) {
      const ics = blockIcs(b);
      const own = `${calId}${encodeURIComponent(blockUid(b.id))}.ics`;
      // An event made in iCloud keeps its own address and UID: replace it with Orbit's.
      if (existing && existing !== own) await d.deleteEvent(creds, existing);
      try {
        return (await d.putEvent(creds, calId, blockUid(b.id), ics)).href;
      } catch (err) {
        if (err instanceof CaldavNotFound) return null;
        throw err;
      }
    },
    remove: (_calId, href) => d.deleteEvent(creds, href),
  };
}

interface Ctx {
  db: Db;
  account: Account;
  remote: BlockRemote;
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

export async function userTimezone(db: Db, userId: string) {
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
    // The Orbit calendar was deleted there: start over with a new one, writing every block again.
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

const windowOf = (now: number) => ({ from: now - WINDOW_BACK_DAYS * 86_400_000, to: now + 366 * 86_400_000 });

/** Changes made in the calendar app to the Orbit calendar's events. */
async function pull(ctx: Ctx, calId: string, state: string | undefined): Promise<string> {
  const { db, account, now } = ctx;
  const { from, to } = windowOf(now);
  const res = await ctx.remote.pull(calId, state, from, to);
  const changes: Mutation[] = [];
  for (const e of res.events) await pullOne(ctx, calId, e, changes);
  if (res.complete) {
    // Linked events in the window that weren't listed were deleted there.
    const seen = new Set(res.events.map((e) => e.id));
    const links = blockLinks(db);
    const linked = await links
      .find({ userId: account.userId, accountId: account._id, end: { $gte: from }, start: { $lt: to } })
      .toArray();
    for (const l of linked) {
      if (seen.has(l.eventId)) continue;
      changes.push(ctx.remove("timeBlocks", l._id, now));
      await links.deleteOne({ _id: l._id });
    }
  }
  await ctx.write(changes);
  return res.next;
}

async function pullOne(ctx: Ctx, calId: string, e: RemoteBlockEvent, changes: Mutation[]) {
  const { db, account, now } = ctx;
  const links = blockLinks(db);
  const at = Math.min(e.updated ?? now, now);
  const link = await links.findOne({ userId: account.userId, accountId: account._id, eventId: e.id });
  if (e.gone) {
    if (link) {
      changes.push(ctx.remove("timeBlocks", link._id, at));
      await links.deleteOne({ _id: link._id });
    }
    return;
  }
  const fields = { title: e.title === "(No title)" ? "Time block" : e.title, start: e.start, end: e.end };
  if (link) {
    if (link.title === fields.title && link.start === fields.start && link.end === fields.end) return;
    changes.push(ctx.upsert("timeBlocks", link._id, fields, at));
    await links.updateOne({ _id: link._id }, { $set: fields });
    return;
  }
  // An event Orbit doesn't know: one it wrote whose link was lost, or one made in the calendar app.
  const claimed = e.orbitBlockId;
  const id = claimed && BLOCK_ID.test(claimed) ? claimed : `tb${hash(`${account._id}:${e.id}`).slice(0, 30)}`;
  const existing = await db.collection("timeBlocks").findOne({ _id: id as never });
  if (existing && existing.userId !== account.userId) return;
  if (existing?.deletedAt) {
    await ctx.remote.remove(calId, e.id);
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
  const { db, account, now } = ctx;
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
    const mine = link?.accountId === account._id ? link : null;
    try {
      if (b.deletedAt) {
        if (mine) {
          await ctx.remote.remove(mine.calendarId, mine.eventId);
          await links.deleteOne({ _id: blockId });
        }
        continue;
      }
      if (b.end < oldest) continue;
      const fields = { title: String(b.title), start: Number(b.start), end: Number(b.end) };
      if (mine && mine.title === fields.title && mine.start === fields.start && mine.end === fields.end) continue;
      calId ??= await createOrbitCalendar(ctx, timeZone);
      let target = mine?.calendarId ?? calId;
      let eventId = mine ? await ctx.remote.write(target, { id: blockId, ...fields }, timeZone, mine.eventId) : null;
      if (!eventId) {
        // New, or deleted there meanwhile: write it again.
        target = calId;
        eventId = await ctx.remote.write(calId, { id: blockId, ...fields }, timeZone, null);
      }
      if (!eventId) continue;
      await links.updateOne(
        { _id: blockId },
        {
          $set: {
            userId: account.userId,
            accountId: account._id,
            calendarId: target,
            eventId,
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

const ORBIT_COLOR = "#ff9500";

async function createOrbitCalendar(ctx: Ctx, timeZone: string): Promise<string> {
  const { db, account, now } = ctx;
  const id = await ctx.remote.createCalendar(ORBIT_CALENDAR_NAME, ORBIT_COLOR, timeZone);
  await db.collection<Account>("calendarAccounts").updateOne({ _id: account._id }, { $set: { orbitCalendarId: id } });
  account.orbitCalendarId = id;
  ctx.remoteIds.add(id);
  await ctx.write([
    ctx.upsert(
      "calendars",
      ctx.calendarDocId(id),
      {
        accountId: account._id,
        provider: ctx.remote.provider,
        name: ORBIT_CALENDAR_NAME,
        color: ORBIT_COLOR,
        selected: true,
        isOrbit: true,
        readOnly: false,
      },
      now,
    ),
  ]);
  return id;
}
