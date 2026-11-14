import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { ulid } from "ulid";
import { eventFields, WINDOW_AHEAD_DAYS, WINDOW_BACK_DAYS } from "@/features/calendar/model";
import { applyMutations } from "@/lib/sync/server";
import type { Mutation } from "@/lib/sync/protocol";
import {
  blockLinks,
  blocksAccountId,
  caldavBlocks,
  googleBlocks,
  syncBlocks,
  userTimezone,
  type BlockRemote,
} from "./blocks";
import { caldav, CaldavAuthFailed, ICLOUD_URL, type CaldavCreds } from "./caldav";
import { parseEvents } from "./ics";
import { decrypt, encrypt, SecretUnreadable } from "./crypto";
import { emailFromIdToken, google, GoogleAuthRevoked, SyncTokenExpired, type GoogleTokens } from "./google";

/**
 * Phase 2B calendar sync, on the server (docs/phases/phase-2b.md, decision 1). Accounts and their
 * secrets live in a server-only collection; calendars and events are written into Orbit's synced
 * tables through the sync server, so every device gets them like any other change.
 */

export interface CalendarAccount {
  _id: string;
  userId: string;
  provider: "google" | "caldav";
  /** Google: the account's email. iCloud: the Apple ID. */
  email: string;
  /** iCloud: the app-specific password (encrypted), the server and where the calendars live. */
  password?: string;
  serverUrl?: string;
  homeUrl?: string;
  refreshToken: string; // encrypted
  accessToken: string; // encrypted
  accessExpires: number;
  /** Per calendar: Google sync token, or iCloud ctag (with the day). */
  syncTokens: Record<string, string>;
  /** Per Google calendar id: push channel. */
  channels: Record<string, { id: string; token: string; resourceId: string; expiration: number }>;
  dirty: boolean;
  /** Another sync of this account is running until then. */
  lockedUntil?: number;
  /** The "Orbit" calendar Orbit created here for time blocks (2B.2), once there was one to write. */
  orbitCalendarId?: string | null;
  /** Time blocks pushed up to this sync version. */
  blocksCursor?: number;
  /** This account was taking time blocks at its last sync. */
  blocksActive?: boolean;
  lastSyncAt: number | null;
  error: string | null;
  createdAt: number;
}

export const accounts = (db: Db) => db.collection<CalendarAccount>("calendarAccounts");

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
/** Stable sync ids (letters and digits) for a calendar and an event. */
export const calendarDocId = (accountId: string, providerId: string) =>
  `cal${hash(`${accountId}:${providerId}`).slice(0, 30)}`;
export const eventDocId = (calendarId: string, providerId: string) =>
  `ce${hash(`${calendarId}:${providerId}`).slice(0, 30)}`;

/** Every account is re-synced at least this often; Google pushes changes sooner. */
export const SYNC_EVERY_MS = 10 * 60_000;

export async function connectGoogle(db: Db, userId: string, tokens: GoogleTokens, now = Date.now()) {
  const email = emailFromIdToken(tokens.id_token) ?? "Google account";
  if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token");
  const _id = `ga${hash(`${userId}:${email}`).slice(0, 30)}`;
  await accounts(db).updateOne(
    { _id },
    {
      $set: {
        userId,
        provider: "google",
        email,
        refreshToken: encrypt(tokens.refresh_token),
        accessToken: encrypt(tokens.access_token),
        accessExpires: now + tokens.expires_in * 1000,
        dirty: true,
        error: null,
      },
      $setOnInsert: { syncTokens: {}, channels: {}, lastSyncAt: null, createdAt: now },
    },
    { upsert: true },
  );
  return _id;
}

async function accessToken(db: Db, a: CalendarAccount, now: number): Promise<string> {
  if (a.accessExpires - now > 60_000) return decrypt(a.accessToken);
  const t = await google().refresh(decrypt(a.refreshToken));
  await accounts(db).updateOne(
    { _id: a._id },
    { $set: { accessToken: encrypt(t.access_token), accessExpires: now + t.expires_in * 1000 } },
  );
  return t.access_token;
}

/** Applies server-made changes in batches the sync server accepts. */
async function write(db: Db, userId: string, mutations: Mutation[]) {
  for (let i = 0; i < mutations.length; i += 200) {
    const res = await applyMutations(db, userId, mutations.slice(i, i + 200), { trusted: true });
    if (res.rejected.length) console.error("calendar sync: rejected", res.rejected.slice(0, 3));
  }
}

const upsert = (
  entity: Mutation["entity"],
  entityId: string,
  fields: Record<string, unknown>,
  now: number,
): Mutation => ({
  mutationId: ulid(),
  entity,
  entityId,
  op: "upsert",
  fields,
  clientTime: now,
});
const remove = (entity: Mutation["entity"], entityId: string, now: number): Mutation => ({
  mutationId: ulid(),
  entity,
  entityId,
  op: "delete",
  clientTime: now,
});

/** Public HTTPS address Google can call with changes; none in development. */
function webhookAddress(): string | null {
  const base = process.env.BETTER_AUTH_URL ?? "";
  return base.startsWith("https://") ? `${base.replace(/\/$/, "")}/api/calendar/google/notify` : null;
}

interface ProviderSync {
  /** Provider calendar ids the account has right now. */
  remoteIds: Set<string>;
  syncTokens: Record<string, string>;
  /** Provider-specific account fields to save. */
  extra: Partial<CalendarAccount>;
  blocks: BlockRemote;
}

/** Brings one account's calendars and events up to date. Never throws for one account's errors. */
export async function syncAccount(db: Db, account: CalendarAccount, now = Date.now()): Promise<void> {
  // One sync per account at a time (a push from Google and a new time block can arrive together).
  // Taking the lock clears `dirty`, so a change that comes in during this sync triggers another.
  const locked = await accounts(db).findOneAndUpdate(
    { _id: account._id, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: Date.now() } }] },
    { $set: { lockedUntil: Date.now() + 90_000, dirty: false } },
    { returnDocument: "after" },
  );
  if (!locked) {
    await accounts(db).updateOne({ _id: account._id }, { $set: { dirty: true } });
    return;
  }
  account = locked;
  let more = false;
  try {
    const side =
      account.provider === "caldav"
        ? await syncCaldavCalendars(db, account, now)
        : await syncGoogleCalendars(db, account, now);

    // Time blocks go to one account (2B.2). Switching accounts in Settings moves them all.
    if ((await blocksAccountId(db, account.userId)) === account._id) {
      if (!account.blocksActive) {
        account.blocksCursor = 0;
        await accounts(db).updateOne({ _id: account._id }, { $set: { blocksActive: true, blocksCursor: 0 } });
      }
      ({ more } = await syncBlocks({
        db,
        account,
        remote: side.blocks,
        now,
        remoteIds: side.remoteIds,
        syncTokens: side.syncTokens,
        write: (m) => write(db, account.userId, m),
        upsert,
        remove,
        calendarDocId: (providerId) => calendarDocId(account._id, providerId),
      }));
    } else if (account.blocksActive) {
      for (const l of await blockLinks(db).find({ accountId: account._id }).toArray()) {
        await side.blocks.remove(l.calendarId, l.eventId);
      }
      await blockLinks(db).deleteMany({ accountId: account._id });
      await accounts(db).updateOne({ _id: account._id }, { $set: { blocksActive: false } });
    }
    await accounts(db).updateOne(
      { _id: account._id },
      {
        $set: {
          ...side.extra,
          syncTokens: side.syncTokens,
          lastSyncAt: now,
          error: null,
          lockedUntil: 0,
          ...(more ? { dirty: true } : {}),
        },
      },
    );
  } catch (err) {
    const error =
      err instanceof GoogleAuthRevoked
        ? "Google disconnected Orbit. Connect again."
        : err instanceof CaldavAuthFailed
          ? "Apple didn't accept the password. Connect again with a new app-specific password."
          : err instanceof SecretUnreadable
            ? "Orbit can't use this connection any more. Disconnect it and connect again."
            : "Couldn't sync. Orbit will retry.";
    const expected =
      err instanceof GoogleAuthRevoked || err instanceof CaldavAuthFailed || err instanceof SecretUnreadable;
    if (!expected) console.error("calendar sync failed", err);
    await accounts(db).updateOne({ _id: account._id }, { $set: { lastSyncAt: now, error, lockedUntil: 0 } });
  }
}

/** Upserts an account's calendars; returns which are shown. New ones start shown when `defaultShown`. */
async function saveCalendars(
  db: Db,
  account: CalendarAccount,
  list: { providerId: string; name: string; color: string; readOnly: boolean; defaultShown: boolean }[],
  now: number,
) {
  const existing = await db
    .collection("calendars")
    .find({ userId: account.userId, accountId: account._id, deletedAt: null })
    .toArray();
  const selected = new Map(existing.map((c) => [String(c._id), Boolean(c.selected)]));
  const changes: Mutation[] = [];
  const docIds = new Map<string, string>();
  for (const c of list) {
    const id = calendarDocId(account._id, c.providerId);
    docIds.set(c.providerId, id);
    const isOrbit = c.providerId === account.orbitCalendarId;
    const fields: Record<string, unknown> = {
      accountId: account._id,
      provider: account.provider,
      name: c.name.slice(0, 300),
      color: c.color.slice(0, 20),
      isOrbit,
      readOnly: c.readOnly,
    };
    if (!selected.has(id)) fields.selected = isOrbit || c.defaultShown;
    changes.push(upsert("calendars", id, fields, now));
  }
  const ids = new Set(docIds.values());
  for (const c of existing) {
    if (ids.has(String(c._id))) continue;
    await dropEvents(db, account.userId, String(c._id), now);
    changes.push(remove("calendars", String(c._id), now));
  }
  await write(db, account.userId, changes);
  const shown = await db
    .collection("calendars")
    .find({ userId: account.userId, accountId: account._id, deletedAt: null, selected: true })
    .project({ _id: 1 })
    .toArray();
  return { docIds, shownIds: new Set(shown.map((c) => String(c._id))) };
}

async function syncGoogleCalendars(db: Db, account: CalendarAccount, now: number): Promise<ProviderSync> {
  const g = google();
  const token = await accessToken(db, account, now);
  const remote = (await g.listCalendars(token)).filter((c) => !c.deleted);
  // New calendars start shown if they're the primary or their own (not holidays or shared ones).
  const { docIds, shownIds } = await saveCalendars(
    db,
    account,
    remote.map((c) => ({
      providerId: c.id,
      name: c.summary ?? "Calendar",
      color: c.backgroundColor ?? "#8e8e93",
      readOnly: !["owner", "writer"].includes(c.accessRole),
      defaultShown: Boolean(c.primary) || c.accessRole === "owner",
    })),
    now,
  );
  const syncTokens = { ...account.syncTokens };
  const channels = { ...account.channels };

  for (const c of remote) {
    const calId = docIds.get(c.id)!;
    if (c.id === account.orbitCalendarId) {
      // Its events are time blocks (synced separately), not calendar events; it still gets a push channel.
    } else if (!shownIds.has(calId)) {
      // Hidden: forget its events and stop listening.
      if (syncTokens[c.id] || channels[c.id]) {
        await dropEvents(db, account.userId, calId, now);
        if (channels[c.id]) await g.stopChannel(token, channels[c.id].id, channels[c.id].resourceId);
        delete syncTokens[c.id];
        delete channels[c.id];
      }
      continue;
    } else {
      syncTokens[c.id] = await syncEvents(db, account.userId, token, c.id, calId, syncTokens[c.id], now);
    }
    const address = webhookAddress();
    const ch = channels[c.id];
    if (address && (!ch || ch.expiration - now < 24 * 3600_000)) {
      if (ch) await g.stopChannel(token, ch.id, ch.resourceId);
      const channel = { id: ulid(), token: randomBytes(16).toString("hex"), address };
      const w = await g.watch(token, c.id, channel).catch((err) => {
        console.error("calendar watch failed", err);
        return null;
      });
      if (w)
        channels[c.id] = { id: channel.id, token: channel.token, resourceId: w.resourceId, expiration: w.expiration };
    }
  }
  return { remoteIds: new Set(remote.map((c) => c.id)), syncTokens, extra: { channels }, blocks: googleBlocks(token) };
}

const caldavCreds = (a: CalendarAccount): CaldavCreds => ({
  serverUrl: a.serverUrl ?? ICLOUD_URL,
  username: a.email,
  password: decrypt(a.password ?? ""),
});

/**
 * iCloud (2B.3): no push, so polled. A calendar's events are fetched again (the whole window) when
 * its ctag changes, and at least once a day as the window moves.
 */
async function syncCaldavCalendars(db: Db, account: CalendarAccount, now: number): Promise<ProviderSync> {
  const d = caldav();
  const creds = caldavCreds(account);
  const homeUrl = account.homeUrl ?? (await d.discover(creds)).homeUrl;
  const timezone = await userTimezone(db, account.userId);
  const remote = await d.listCalendars(creds, homeUrl);
  const { docIds, shownIds } = await saveCalendars(
    db,
    account,
    remote.map((c) => ({
      providerId: c.url,
      name: c.name,
      color: c.color ?? "#8e8e93",
      readOnly: c.readOnly,
      // Your own calendars; shared ones (read-only) start hidden, like in Google.
      defaultShown: !c.readOnly,
    })),
    now,
  );
  const syncTokens = { ...account.syncTokens };
  const from = now - WINDOW_BACK_DAYS * 86_400_000;
  const to = now + WINDOW_AHEAD_DAYS * 86_400_000;
  const today = new Date(now).toISOString().slice(0, 10);
  for (const c of remote) {
    const calId = docIds.get(c.url)!;
    const key = c.url;
    if (c.url === account.orbitCalendarId) continue; // time blocks
    if (!shownIds.has(calId)) {
      if (syncTokens[key]) {
        await dropEvents(db, account.userId, calId, now);
        delete syncTokens[key];
      }
      continue;
    }
    const tag = `${c.ctag ?? ulid()}|${today}`;
    if (c.ctag && syncTokens[key] === tag) continue; // nothing changed
    const objects = await d.listEvents(creds, c.url, from, to);
    const seen = new Set<string>();
    const changes: Mutation[] = [];
    for (const o of objects) {
      for (const e of parseEvents(o.ics, from, to, timezone)) {
        const id = eventDocId(calId, e.key);
        if (seen.has(id)) continue;
        seen.add(id);
        changes.push(
          upsert(
            "calendarEvents",
            id,
            {
              calendarId: calId,
              title: e.title,
              start: e.start,
              end: e.end,
              allDay: e.allDay,
              startDay: e.startDay,
              endDay: e.endDay,
              location: e.location,
              status: e.status,
              link: null,
            },
            now,
          ),
        );
      }
    }
    const had = await db
      .collection("calendarEvents")
      .find({ userId: account.userId, calendarId: calId, deletedAt: null })
      .project({ _id: 1 })
      .toArray();
    for (const e of had) if (!seen.has(String(e._id))) changes.push(remove("calendarEvents", String(e._id), now));
    await write(db, account.userId, changes);
    syncTokens[key] = tag;
  }
  return {
    remoteIds: new Set(remote.map((c) => c.url)),
    syncTokens,
    extra: { homeUrl },
    blocks: caldavBlocks(creds, homeUrl, timezone),
  };
}

/** Connect iCloud: checks the Apple ID and app-specific password by finding the calendars. */
export async function connectCaldav(
  db: Db,
  userId: string,
  input: { username: string; password: string; serverUrl?: string },
  now = Date.now(),
) {
  const creds = {
    serverUrl: input.serverUrl ?? ICLOUD_URL,
    username: input.username.trim(),
    password: input.password.trim(),
  };
  const { homeUrl } = await caldav().discover(creds); // throws CaldavAuthFailed
  const _id = `ca${hash(`${userId}:${creds.serverUrl}:${creds.username.toLowerCase()}`).slice(0, 30)}`;
  await accounts(db).updateOne(
    { _id },
    {
      $set: {
        userId,
        provider: "caldav",
        email: creds.username,
        serverUrl: creds.serverUrl,
        homeUrl,
        password: encrypt(creds.password),
        refreshToken: "",
        accessToken: "",
        accessExpires: 0,
        dirty: true,
        error: null,
      },
      $setOnInsert: { syncTokens: {}, channels: {}, lastSyncAt: null, createdAt: now },
    },
    { upsert: true },
  );
  return _id;
}

/** Incremental when there's a sync token; a full sync of the window otherwise. Returns the next token. */
async function syncEvents(
  db: Db,
  userId: string,
  token: string,
  googleCalendarId: string,
  calId: string,
  syncToken: string | undefined,
  now: number,
): Promise<string> {
  const g = google();
  const timeMin = new Date(now - WINDOW_BACK_DAYS * 86_400_000).toISOString();
  const timeMax = new Date(now + WINDOW_AHEAD_DAYS * 86_400_000).toISOString();
  const full = !syncToken;
  const seen = new Set<string>();
  const changes: Mutation[] = [];
  let pageToken: string | undefined;
  let next = syncToken ?? "";
  try {
    do {
      const page = await g.listEvents(token, googleCalendarId, { syncToken, pageToken, timeMin, timeMax });
      for (const e of page.items) {
        const id = eventDocId(calId, e.id);
        const fields = eventFields(e, calId);
        const min = now - WINDOW_BACK_DAYS * 86_400_000;
        const max = now + WINDOW_AHEAD_DAYS * 86_400_000;
        if (!fields || fields.end < min || fields.start > max) changes.push(remove("calendarEvents", id, now));
        else {
          seen.add(id);
          changes.push(upsert("calendarEvents", id, fields, now));
        }
      }
      pageToken = page.nextPageToken;
      if (page.nextSyncToken) next = page.nextSyncToken;
    } while (pageToken);
  } catch (err) {
    if (err instanceof SyncTokenExpired && syncToken)
      return syncEvents(db, userId, token, googleCalendarId, calId, undefined, now);
    throw err;
  }
  if (full) {
    // A full sync is the whole truth for the window: anything Orbit had that Google didn't return is gone.
    const had = await db
      .collection("calendarEvents")
      .find({ userId, calendarId: calId, deletedAt: null })
      .project({ _id: 1 })
      .toArray();
    for (const e of had) if (!seen.has(String(e._id))) changes.push(remove("calendarEvents", String(e._id), now));
  }
  await write(db, userId, changes);
  return next;
}

async function dropEvents(db: Db, userId: string, calId: string, now: number) {
  const had = await db
    .collection("calendarEvents")
    .find({ userId, calendarId: calId, deletedAt: null })
    .project({ _id: 1 })
    .toArray();
  await write(
    db,
    userId,
    had.map((e) => remove("calendarEvents", String(e._id), now)),
  );
}

/** From the per-minute job: accounts with pushed changes, or not synced for a while. */
export async function dispatchCalendarSync(db: Db, now = Date.now(), budgetMs = 40_000) {
  const due = await accounts(db)
    .find({ $or: [{ dirty: true }, { lastSyncAt: null }, { lastSyncAt: { $lt: now - SYNC_EVERY_MS } }] })
    .toArray();
  let synced = 0;
  const started = Date.now();
  for (const a of due) {
    if (Date.now() - started > budgetMs) break; // the rest go next minute
    await syncAccount(db, a, now);
    synced++;
  }
  return { calendars: synced };
}

/** Disconnect: stop listening, revoke access, and remove the account's calendars and events. */
export async function disconnectAccount(db: Db, userId: string, accountId: string, now = Date.now()) {
  const a = await accounts(db).findOne({ _id: accountId, userId });
  if (!a) return false;
  if (a.provider === "google") {
    const g = google();
    try {
      const token = await accessToken(db, a, now);
      for (const ch of Object.values(a.channels ?? {})) await g.stopChannel(token, ch.id, ch.resourceId);
      await g.revoke(decrypt(a.refreshToken));
    } catch {
      // Already revoked on Google's side: nothing to stop.
    }
  }
  // iCloud: Orbit just forgets the password; you can also revoke it at account.apple.com.
  const cals = await db.collection("calendars").find({ userId, accountId, deletedAt: null }).toArray();
  for (const c of cals) await dropEvents(db, userId, String(c._id), now);
  await write(
    db,
    userId,
    cals.map((c) => remove("calendars", String(c._id), now)),
  );
  // Time blocks stay in Orbit; they're written to the next blocks account from scratch.
  await blockLinks(db).deleteMany({ userId, accountId });
  await accounts(db).deleteOne({ _id: accountId, userId });
  await resetBlocksCursor(db, userId);
  return true;
}

/** What Settings shows about each connected account (no secrets). */
export async function listAccounts(db: Db, userId: string) {
  return (await accounts(db).find({ userId }).sort({ createdAt: 1 }).toArray()).map((a) => ({
    id: a._id,
    provider: a.provider,
    email: a.email,
    lastSyncAt: a.lastSyncAt,
    error: a.error,
  }));
}

/** Google's push notification for a calendar: find the account by channel and mark it for sync. */
export async function markChannelDirty(db: Db, channelId: string, channelToken: string) {
  const all = await accounts(db).find({}).project({ _id: 1, channels: 1 }).toArray();
  for (const a of all) {
    for (const ch of Object.values((a.channels ?? {}) as CalendarAccount["channels"])) {
      if (ch.id === channelId && ch.token === channelToken) {
        await accounts(db).updateOne({ _id: a._id }, { $set: { dirty: true } });
        return String(a._id);
      }
    }
  }
  return null;
}

/** Every time block is pushed again (to whichever account now takes them). */
export async function resetBlocksCursor(db: Db, userId: string) {
  await accounts(db).updateMany({ userId }, { $set: { blocksCursor: 0, dirty: true } });
}

/** A device just changed time blocks: sync the account they go to now, rather than next minute. */
export async function syncBlocksNow(db: Db, userId: string) {
  const id = await blocksAccountId(db, userId);
  if (!id) return;
  await accounts(db).updateOne({ _id: id }, { $set: { dirty: true } });
  const a = await accounts(db).findOne({ _id: id });
  if (a) await syncAccount(db, a);
}
