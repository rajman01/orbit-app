import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { Db, Document } from "mongodb";
import { ulid } from "ulid";
import { CHECKIN_MARK } from "@/features/coach/protocol";
import { dueCheckins, weekFacts, type Checkin } from "@/features/coach/checkins";
import { withTaskDefaults, type Task } from "@/features/tasks/model";
import { addDays, dayOf } from "@/lib/dates";
import { sendToUser, type Sender } from "@/lib/push/server";
import { applyMutations } from "@/lib/sync/server";
import type { Mutation } from "@/lib/sync/protocol";
import { coachConfigured, coachModels, recordUsage } from "./server";

/**
 * AI-7 / PRD §8.4: proactive check-ins and the weekly summary. Run from the per-minute reminder
 * job. Each check-in becomes its own coach conversation (written through the sync server, so it
 * appears on every device) and a push notification that opens it. Check-ins only talk: they never
 * change the user's data (§10.5).
 */

const done = (db: Db) => db.collection<{ _id: string; userId: string; at: Date }>("coachCheckins");
const live = <T extends Document>(filter: T) => ({ ...filter, deletedAt: null });
const withId = <T extends Document>(d: T) => ({ ...d, id: String(d._id) });

/** A stable id from a string (valid as a sync id: letters and digits). */
const idFor = (prefix: string, s: string) => `${prefix}${createHash("sha256").update(s).digest("hex").slice(0, 30)}`;

export async function dispatchCheckins(db: Db, now: number, send: Sender | null) {
  if (!coachConfigured()) return { checkins: 0 };
  let count = 0;
  const users = await db
    .collection("settings")
    .find(live({ onboardingCompletedAt: { $ne: null } }))
    .toArray();
  for (const settings of users) {
    const userId = String(settings.userId);
    try {
      count += await checkInUser(db, userId, settings, now, send);
    } catch (err) {
      console.error("coach check-in failed", err);
    }
  }
  return { checkins: count };
}

async function checkInUser(db: Db, userId: string, settings: Document, now: number, send: Sender | null) {
  const tz = (settings.timezone as string) ?? "UTC";
  const today = dayOf(now, tz);
  const [rituals, taskDocs, taskEvents, goals, cycles, sent] = await Promise.all([
    db
      .collection("rituals")
      .find(live({ userId, date: { $gte: addDays(today, -7) } }))
      .toArray(),
    db.collection("tasks").find(live({ userId })).toArray(),
    db
      .collection("taskEvents")
      .find(live({ userId, type: "skip" }))
      .toArray(),
    db
      .collection("goals")
      .find(live({ userId, status: "active" }))
      .toArray(),
    db
      .collection("cycles")
      .find(live({ userId, startDate: { $lte: today }, endDate: { $gte: today } }))
      .toArray(),
    done(db).find({ userId }).project({ _id: 1 }).toArray(),
  ]);
  const tasks = taskDocs.map((t) => withTaskDefaults(withId(t) as unknown as Task));
  const due = dueCheckins({
    now,
    settings: settings as never,
    firstDay: dayOf(Number(settings.createdAt ?? now), tz),
    rituals: rituals as never,
    tasks,
    taskEvents: taskEvents as never,
    goals: goals.map((g) => ({ ...withId(g), healthSetAt: g.fieldUpdatedAt?.health })) as never,
    cycles: cycles.map(withId) as never,
    sent: new Set(sent.map((s) => String(s._id).slice(userId.length + 1))),
  });

  let count = 0;
  for (const c of due) {
    // Claim it first, so an overlapping run can't send the same one twice.
    const claimed = await done(db)
      .insertOne({ _id: `${userId}:${c.key}`, userId, at: new Date(now) })
      .then(() => true)
      .catch(() => false);
    if (!claimed) continue;
    if (c.kind === "weekly") {
      const xp = await db
        .collection("xpEvents")
        .find(live({ userId, at: { $gte: now - 7 * 86_400_000 } }))
        .toArray();
      Object.assign(
        c,
        weekFacts({
          today,
          timezone: tz,
          tasks,
          taskEvents: taskEvents as never,
          rituals: rituals as never,
          xpGained: xp.reduce((n, e) => n + Number(e.amount ?? 0), 0),
        }),
      );
    }
    const text = await write(db, userId, c);
    const threadId = await deliver(db, userId, c, text, now);
    if (send)
      await sendToUser(db, userId, { ...c.push, url: `/coach?t=${threadId}`, tag: `orbit-checkin-${c.kind}` }, send);
    count++;
  }
  return count;
}

let client: Anthropic | undefined;

const SYSTEM = `You are the coach inside Orbit, a personal life-management app. You're reaching out on your own, so be brief and kind: a mirror, not a judge.
Write 2–4 short sentences from the facts given: name what you noticed plainly, then offer one concrete, small next move as a question they can answer with a word ("Want me to…?"). For a weekly summary: up to 6 sentences — what went well, one pattern worth noticing, and one suggestion for next week.
Plain text, no headings or lists, no emoji. Don't invent anything beyond the facts.`;

/** The message text: written by the light model, or the plain fallback (tests, no key, errors). */
async function write(db: Db, userId: string, c: Checkin): Promise<string> {
  if (process.env.COACH_FAKE === "1" || !process.env.ANTHROPIC_API_KEY) return c.fallback;
  try {
    client ??= new Anthropic();
    const res = await client.messages.create({
      model: coachModels().light,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Kind: ${c.kind}\nFacts:\n${c.facts}` }],
    });
    await recordUsage(db, userId, res.usage, "light").catch(() => {});
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return res.stop_reason === "refusal" || !text ? c.fallback : text;
  } catch (err) {
    console.error("coach check-in writing failed", err);
    return c.fallback;
  }
}

/**
 * Saves the check-in as a conversation through the sync server, so it reaches every device:
 * a hidden opening message with the facts (the model needs a user turn first, and the context),
 * then the coach's message.
 */
async function deliver(db: Db, userId: string, c: Checkin, text: string, now: number): Promise<string> {
  const threadId = idFor("ck", `${userId}:${c.key}`);
  const m = (entity: Mutation["entity"], entityId: string, fields: Record<string, unknown>): Mutation => ({
    mutationId: ulid(),
    entity,
    entityId,
    op: "upsert",
    fields,
    clientTime: now,
  });
  const result = await applyMutations(db, userId, [
    m("aiThreads", threadId, { title: c.title.slice(0, 200), lastMessageAt: now, archivedAt: null }),
    m("aiMessages", idFor("cm", `${threadId}:0`), {
      threadId,
      seq: 0,
      role: "user",
      content: [{ type: "text", text: `${CHECKIN_MARK} You checked in on your own (${c.kind}). Facts:\n${c.facts}` }],
      at: now,
    }),
    m("aiMessages", idFor("cm", `${threadId}:1`), {
      threadId,
      seq: 1,
      role: "assistant",
      content: [{ type: "text", text }],
      at: now,
    }),
  ]);
  if (result.rejected.length) throw new Error(`check-in not saved: ${result.rejected.map((r) => r.reason).join("; ")}`);
  return threadId;
}
