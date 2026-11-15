import "server-only";
import type { Db } from "mongodb";
import { ulid } from "ulid";
import {
  careerProfileId,
  htmlToText,
  KEEP_FIT,
  postingKey,
  preferenceMiss,
  profileReadiness,
  STRONG_FIT,
  type CareerProfileFields,
  type JobPostingFields,
} from "@/features/jobs/model";
import { settingsId } from "@/features/settings/model";
import { dailyLimitUsd, spentToday } from "@/lib/coach/server";
import { dayOf } from "@/lib/dates";
import type { Mutation } from "@/lib/sync/protocol";
import { applyMutations } from "@/lib/sync/server";
import { rankPostings, readPosting } from "./ai";
import { FetchRefused, safeFetchText } from "./safe-fetch";
import { plannedSources, type FoundPosting } from "./sources";

/**
 * Phase 3D.1: the daily search. For each profile, once a day: check the planned sources, keep
 * roles matching the preferences that haven't been seen, rank the newest with the light model, and
 * save the good ones as found roles (synced like any data). Roles seen once are remembered for 90
 * days so they're never ranked twice.
 */

export const MAX_RANKED_PER_RUN = 25;
export const CHECK_NOW_EVERY_MS = 15 * 60_000;
export const KEEP_DAYS = 30;

interface RunDoc {
  _id: string; // `${userId}:${day}`
  userId: string;
  day: string;
  at: Date;
  checked: number;
  matched: number;
  ranked: number;
  kept: number;
  errors: string[];
}

const runs = (db: Db) => db.collection<RunDoc>("jobSearchRuns");
const seen = (db: Db) => db.collection<{ _id: string; userId: string; at: Date }>("jobSeen");

let indexes: Promise<void> | undefined;
function ensureIndexes(db: Db) {
  indexes ??= (async () => {
    await seen(db).createIndex({ at: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
    await runs(db).createIndex({ at: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });
    await runs(db).createIndex({ userId: 1, at: -1 });
  })();
  return indexes;
}

export async function loadProfile(db: Db, userId: string): Promise<CareerProfileFields | null> {
  const doc = await db
    .collection("careerProfile")
    .findOne({ _id: careerProfileId(userId) as never, userId, deletedAt: null });
  return (doc as unknown as CareerProfileFields | null) ?? null;
}

async function timezoneOf(db: Db, userId: string) {
  const s = await db.collection("settings").findOne({ _id: settingsId(userId) as never, deletedAt: null });
  return (s?.timezone as string | undefined) ?? "UTC";
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

async function savePostings(db: Db, userId: string, rows: JobPostingFields[], now: number) {
  const ids: string[] = [];
  const mutations = rows.map((r) => {
    const id = ulid();
    ids.push(id);
    return upsert("jobPostings", id, r as unknown as Record<string, unknown>, now);
  });
  for (let i = 0; i < mutations.length; i += 100)
    await applyMutations(db, userId, mutations.slice(i, i + 100), { trusted: true });
  return ids;
}

/** Found roles nobody acted on go after 30 days (saved ones and leads stay). */
async function prune(db: Db, userId: string, now: number) {
  const old = await db
    .collection("jobPostings")
    .find({
      userId,
      deletedAt: null,
      status: { $in: ["new", "dismissed"] },
      foundAt: { $lt: now - KEEP_DAYS * 86_400_000 },
    })
    .project({ _id: 1 })
    .limit(200)
    .toArray();
  if (!old.length) return;
  await applyMutations(
    db,
    userId,
    old.map((o) => ({
      mutationId: ulid(),
      entity: "jobPostings" as const,
      entityId: String(o._id),
      op: "delete" as const,
      clientTime: now,
    })),
    { trusted: true },
  );
}

export interface RunResult {
  ran: boolean;
  reason?: string;
  checked?: number;
  matched?: number;
  ranked?: number;
  kept?: number;
  errors?: string[];
}

/**
 * One search for one user. Without `force` it runs once a day; with it ("Check now"), at most every
 * 15 minutes.
 */
export async function runJobSearch(
  db: Db,
  userId: string,
  now: number,
  opts: { force?: boolean } = {},
): Promise<RunResult> {
  await ensureIndexes(db);
  const profile = await loadProfile(db, userId);
  if (!profile || !profileReadiness(profile).ready) return { ran: false, reason: "profile" };
  const tz = await timezoneOf(db, userId);
  const day = dayOf(now, tz);
  const last = await runs(db).findOne({ userId }, { sort: { at: -1 } });
  if (!opts.force && last?.day === day) return { ran: false, reason: "done today" };
  if (opts.force && last && now - last.at.getTime() < CHECK_NOW_EVERY_MS) return { ran: false, reason: "too soon" };
  // Claim the run first, so two overlapping jobs don't both search.
  const runId = `${userId}:${day}${opts.force ? `:${now}` : ""}`;
  const claimed = await runs(db)
    .insertOne({ _id: runId, userId, day, at: new Date(now), checked: 0, matched: 0, ranked: 0, kept: 0, errors: [] })
    .then(() => true)
    .catch(() => false);
  if (!claimed) return { ran: false, reason: "running" };

  const plans = plannedSources(profile.preferences, profile.companies);
  const errors: string[] = [];
  const results = await Promise.allSettled(plans.map((p) => p.run()));
  const candidates: (FoundPosting & { fromBoard: boolean })[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled")
      for (const p of r.value) candidates.push({ ...p, fromBoard: plans[i].fromCompanyBoard });
    else errors.push(`${plans[i].label}: ${r.reason instanceof Error ? r.reason.message : "failed"}`.slice(0, 200));
  });

  // Matching, new, one per role (the same job on two boards counts once), newest first.
  const existing = new Set(
    (
      await db
        .collection("jobPostings")
        .find({ userId, deletedAt: null })
        .project({ company: 1, title: 1, location: 1 })
        .toArray()
    ).map((p) => postingKey(p as never)),
  );
  const byKey = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    if (!c.title || !c.url) continue;
    if (preferenceMiss(c, profile.preferences, { fromCompanyBoard: c.fromBoard })) continue;
    const key = postingKey(c);
    if (existing.has(key) || byKey.has(key)) continue;
    byKey.set(key, c);
  }
  const keys = [...byKey.keys()];
  const already = new Set(
    (
      await seen(db)
        .find({ _id: { $in: keys.map((k) => `${userId}:${k}`) } })
        .project({ _id: 1 })
        .toArray()
    ).map((d) => String(d._id).slice(userId.length + 1)),
  );
  const fresh = keys
    .filter((k) => !already.has(k))
    .map((k) => byKey.get(k)!)
    .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0))
    .slice(0, MAX_RANKED_PER_RUN);

  // Ranking costs a little; skip it (and keep them unranked) once the day's AI budget is spent.
  const canRank = (await spentToday(db, userId)) < dailyLimitUsd();
  const ranked = canRank
    ? await rankPostings(db, userId, profile, fresh).catch((e) => {
        errors.push(`Ranking: ${e instanceof Error ? e.message : "failed"}`.slice(0, 200));
        return fresh.map(() => null);
      })
    : fresh.map(() => null);

  const keep: JobPostingFields[] = [];
  fresh.forEach((p, i) => {
    const r = ranked[i];
    if (r && r.fit < KEEP_FIT) return;
    const { fromBoard: _fromBoard, ...posting } = p;
    keep.push({
      ...posting,
      foundAt: now,
      fit: r?.fit ?? null,
      why: r?.why ?? [],
      gaps: r?.gaps ?? [],
      status: "new",
      leadId: null,
    });
  });
  await savePostings(db, userId, keep, now);
  if (fresh.length)
    await seen(db)
      .bulkWrite(
        fresh.map((p) => ({
          updateOne: {
            filter: { _id: `${userId}:${postingKey(p)}` },
            update: { $set: { userId, at: new Date(now) } },
            upsert: true,
          },
        })),
        { ordered: false },
      )
      .catch(() => {});
  await prune(db, userId, now).catch(() => {});
  const summary = {
    checked: candidates.length,
    matched: byKey.size,
    ranked: ranked.filter(Boolean).length,
    kept: keep.length,
    errors,
  };
  await runs(db).updateOne({ _id: runId }, { $set: summary });
  return { ran: true, ...summary };
}

/**
 * The per-minute job: the next user whose daily search hasn't run today (from 05:00 their time).
 * One user per minute keeps each run well inside the function's time limit.
 */
export async function dispatchJobSearch(db: Db, now: number) {
  await ensureIndexes(db);
  const profiles = await db.collection("careerProfile").find({ deletedAt: null }).project({ userId: 1 }).toArray();
  for (const p of profiles) {
    const userId = String(p.userId);
    const tz = await timezoneOf(db, userId);
    const local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now);
    if (Number(local) < 5) continue;
    const last = await runs(db).findOne({ userId }, { sort: { at: -1 } });
    if (last?.day === dayOf(now, tz)) continue;
    const r = await runJobSearch(db, userId, now);
    if (r.ran) return { jobSearches: 1 };
  }
  return { jobSearches: 0 };
}

/** The strong new matches found today, for the morning push. */
export async function strongNewMatches(db: Db, userId: string, since: number) {
  const rows = await db
    .collection("jobPostings")
    .find({ userId, deletedAt: null, status: "new", foundAt: { $gte: since }, fit: { $gte: STRONG_FIT } })
    .project({ title: 1, company: 1, fit: 1 })
    .sort({ fit: -1 })
    .limit(20)
    .toArray();
  return rows.map((r) => ({ title: String(r.title), company: String(r.company), fit: Number(r.fit) }));
}

// ---------------------------------------------------------------- adding one role by link or text

export class ImportError extends Error {}

/**
 * A posting from a link (read safely) or pasted text: read with the light model, ranked against the
 * profile, saved as a found role you've saved. Returns its id.
 */
export async function importPosting(
  db: Db,
  userId: string,
  input: { url?: string; text?: string },
  now: number,
): Promise<string> {
  const url = input.url?.trim() ?? "";
  let pageText = input.text?.trim() ?? "";
  if (!pageText) {
    if (!url) throw new ImportError("Paste a link or the job's text.");
    try {
      const page = await safeFetchText(url, { timeoutMs: 12_000 });
      if (page.status >= 400) throw new ImportError(`That page answered ${page.status}. Paste the job's text instead.`);
      pageText = page.contentType.includes("json") ? page.text : htmlToText(page.text);
    } catch (e) {
      if (e instanceof ImportError || e instanceof FetchRefused) throw new ImportError(e.message);
      throw new ImportError("Couldn't open that link. Paste the job's text instead.");
    }
  }
  const read = await readPosting(db, userId, pageText, url);
  if (!read)
    throw new ImportError(
      "That doesn't look like a single job posting (some sites need a login). Paste the job's text instead.",
    );
  const profile = await loadProfile(db, userId);
  const posting: FoundPosting = { source: "link", externalId: url || `text:${now}`, url, postedAt: null, ...read };
  const [rank] =
    profile && (await spentToday(db, userId)) < dailyLimitUsd()
      ? await rankPostings(db, userId, profile, [posting]).catch(() => [null])
      : [null];
  const [id] = await savePostings(
    db,
    userId,
    [
      {
        ...posting,
        foundAt: now,
        fit: rank?.fit ?? null,
        why: rank?.why ?? [],
        gaps: rank?.gaps ?? [],
        status: "saved",
        leadId: null,
      },
    ],
    now,
  );
  return id;
}

/** The last search's summary, for the page ("Checked 6 sources this morning"). */
export async function lastRun(db: Db, userId: string) {
  const r = await runs(db).findOne({ userId }, { sort: { at: -1 } });
  return r
    ? { at: r.at.getTime(), checked: r.checked, matched: r.matched, ranked: r.ranked, kept: r.kept, errors: r.errors }
    : null;
}
