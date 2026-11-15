import "server-only";
import { ObjectId, type Db } from "mongodb";
import { accounts as calendarAccounts, disconnectAccount } from "@/lib/calendar/server";
import { ENTITY_NAMES, type EntityName } from "@/lib/sync/entities";

/**
 * Phase 2D.4 (SET-5, SET-7): what's connected, export everything, and delete the account.
 */

/** Better Auth stores user ids as ObjectIds; Orbit's own data uses the string. */
const authId = (userId: string): ObjectId | string => (ObjectId.isValid(userId) ? new ObjectId(userId) : userId);

const PRIVATE = new Set(["_id", "userId", "fieldUpdatedAt", "serverVersion"]);

function clean(doc: Record<string, unknown>) {
  const out: Record<string, unknown> = { id: String(doc._id) };
  for (const [k, v] of Object.entries(doc)) if (!PRIVATE.has(k)) out[k] = v;
  return out;
}

/** SET-5: how you sign in, and what else Orbit is connected to. */
export async function connections(db: Db, userId: string) {
  const [user, logins, calendars, tokens] = await Promise.all([
    db.collection("user").findOne({ _id: authId(userId) as never }),
    db
      .collection("account")
      .find({ userId: authId(userId) })
      .project({ providerId: 1 })
      .toArray(),
    calendarAccounts(db).find({ userId }).toArray(),
    db.collection("apiTokens").countDocuments({ userId }),
  ]);
  return {
    email: (user?.email as string | undefined) ?? null,
    signIn: [...new Set(logins.map((a) => String(a.providerId)))].map((p) => (p === "credential" ? "password" : p)),
    calendars: calendars.map((c) => ({
      provider: c.provider,
      email: (c as { email?: string | null }).email ?? null,
      error: (c as { error?: string | null }).error ?? null,
    })),
    tokens,
  };
}

/** SET-7: everything you've put in Orbit (deleted things left out), by entity. */
export async function exportData(db: Db, userId: string, now = new Date()) {
  const user = await db.collection("user").findOne({ _id: authId(userId) as never });
  const data = {} as Record<EntityName, Record<string, unknown>[]>;
  for (const name of ENTITY_NAMES) {
    const rows = await db.collection(name).find({ userId, deletedAt: null }).toArray();
    data[name] = rows.map((r) => clean(r as Record<string, unknown>));
  }
  return {
    format: "orbit-export",
    version: 1,
    exportedAt: now.toISOString(),
    account: { name: user?.name ?? null, email: user?.email ?? null, createdAt: user?.createdAt ?? null },
    data,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** SET-7: the parts worth reading as text — vision, goals, journal, wins — as one markdown file. */
export function exportMarkdown(exported: Awaited<ReturnType<typeof exportData>>): string {
  const d = exported.data;
  const lines: string[] = [`# Orbit export`, ``, `Exported ${exported.exportedAt.slice(0, 10)}.`, ``];
  const vision = d.vision[0];
  if (vision) {
    lines.push(`## Vision`, ``);
    for (const t of (vision.themes as { year: number; theme: string }[]) ?? [])
      lines.push(`- **${t.year}:** ${t.theme}`);
    for (const v of (vision.values as { name: string; description: string }[]) ?? [])
      lines.push(`- *${v.name}*${v.description ? ` — ${v.description}` : ""}`);
    for (const [k, label] of [
      ["oneYear", "In a year"],
      ["fiveYear", "In 5 years"],
      ["tenYear", "In 10 years"],
    ] as const)
      if (str(vision[k]).trim()) lines.push(``, `### ${label}`, ``, str(vision[k]).trim());
    lines.push(``);
  }
  const areas = new Map(d.areas.map((a) => [a.id as string, str(a.name)]));
  if (d.goals.length) {
    lines.push(`## Goals`, ``);
    for (const g of d.goals) {
      const area = areas.get(g.areaId as string);
      lines.push(
        `### ${str(g.title)}`,
        ``,
        `${str(g.status)}${area ? ` · ${area}` : ""}${g.targetDate ? ` · by ${g.targetDate}` : ""}`,
      );
      if (str(g.description).trim()) lines.push(``, str(g.description).trim());
      const krs = d.keyResults.filter((k) => k.goalId === g.id);
      for (const k of krs) lines.push(`- ${str(k.title)}: ${k.current} / ${k.target}${k.unit ? ` ${k.unit}` : ""}`);
      for (const m of d.milestones.filter((x) => x.goalId === g.id))
        lines.push(`- [${m.doneAt ? "x" : " "}] ${str(m.title)}${m.dueDate ? ` (${m.dueDate})` : ""}`);
      for (const e of d.goalEvents.filter((x) => x.goalId === g.id && x.type === "note"))
        lines.push(`- Update ${new Date(Number(e.at)).toISOString().slice(0, 10)}: ${str(e.text)}`);
      lines.push(``);
    }
  }
  const journal = [...d.journalEntries].sort((a, b) => str(b.date).localeCompare(str(a.date)));
  if (journal.length) {
    lines.push(`## Journal`, ``);
    for (const j of journal) {
      const meta = [j.mood ? `mood ${j.mood}/5` : "", j.energy ? `energy ${j.energy}/5` : ""]
        .filter(Boolean)
        .join(", ");
      lines.push(`### ${str(j.date)}${meta ? ` (${meta})` : ""}`, ``);
      if (str(j.text).trim()) lines.push(str(j.text).trim(), ``);
    }
  }
  const wins = [...d.wins].sort((a, b) => str(b.date).localeCompare(str(a.date)));
  if (wins.length) {
    lines.push(`## Wins`, ``);
    for (const w of wins) {
      lines.push(`- **${str(w.title)}** (${str(w.date)})`);
      if (str(w.description).trim()) lines.push(`  ${str(w.description).trim().replace(/\n+/g, " ")}`);
      if (str(w.impact).trim()) lines.push(`  *Impact:* ${str(w.impact).trim().replace(/\n+/g, " ")}`);
    }
    lines.push(``);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * SET-7: deletes the account and everything in it. Calendar connections are disconnected first
 * (revoking Google's access); then every collection's documents for the user, the user's
 * sessions and sign-in methods, and the user. Other users' data is never touched.
 */
export async function deleteAccount(db: Db, userId: string) {
  if (!userId) throw new Error("no user");
  for (const a of await calendarAccounts(db).find({ userId }).toArray()) {
    await disconnectAccount(db, userId, a._id).catch(() => {});
  }
  const auth = new Set(["user", "session", "account", "verification"]);
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  const escaped = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let removed = 0;
  for (const name of names) {
    if (auth.has(name) || name.startsWith("system.")) continue;
    const c = db.collection(name);
    removed += (await c.deleteMany({ userId })).deletedCount;
    // Per-user counters and usage keyed by id: `userId` or `userId:…`.
    removed += (await c.deleteMany({ _id: { $regex: `^${escaped}(:|$)` } as never })).deletedCount;
  }
  const id = authId(userId);
  await db.collection("session").deleteMany({ userId: id });
  await db.collection("account").deleteMany({ userId: id });
  await db.collection("user").deleteOne({ _id: id as never });
  return { removed };
}
