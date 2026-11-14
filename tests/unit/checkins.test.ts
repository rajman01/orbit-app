import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkinsEnabled, dueCheckins, weekFacts } from "@/features/coach/checkins";
import { CHECKIN_MARK } from "@/features/coach/protocol";
import { newTaskFields, type Task } from "@/features/tasks/model";
import { dispatchCheckins } from "@/lib/coach/checkins";
import type { Sender } from "@/lib/push/server";

vi.mock("server-only", () => ({}));

/** Coach check-ins (PRD §8.4, AI-7). Saturday 14 Nov 2026; the week starts on Sunday. */
const at = (time: string) => Date.parse(`2026-11-14T${time}:00Z`);

const task = (id: string, fields: Partial<Task> = {}): Task =>
  ({
    ...newTaskFields({ title: `Task ${id}`, status: "todo" }),
    id,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    serverVersion: 1,
    ...fields,
  }) as Task;

const base = {
  now: at("10:30"),
  settings: { timezone: "UTC", strictness: "firm" as const, weekStartDay: 0 },
  firstDay: "2026-11-01",
  rituals: [] as { type: "daily_plan" | "daily_shutdown" | "cycle_review"; date: string; completedAt: number | null }[],
  tasks: [] as Task[],
  taskEvents: [] as { taskId: string; type: "skip"; reason: string | null; at: number }[],
  goals: [] as { id: string; title: string; status: "active"; health: "off_track" | null; healthSetAt?: number }[],
  cycles: [] as never[],
  sent: new Set<string>(),
};
const kinds = (opts: Partial<typeof base>) => dueCheckins({ ...base, ...opts } as never).map((c) => c.kind);

describe("when the coach checks in", () => {
  it("after two days without a plan or shutdown, once per lapse", () => {
    const rituals = [{ type: "daily_plan" as const, date: "2026-11-11", completedAt: 1 }];
    const due = dueCheckins({ ...base, rituals } as never);
    expect(due.map((c) => c.key)).toEqual(["missed:2026-11-13"]);
    // Still lapsed the next day: not again (the day three days back wasn't done).
    expect(kinds({ rituals, now: Date.parse("2026-11-15T10:30:00Z") })).toEqual([]);
    // A day without and then back on track: nothing.
    expect(kinds({ rituals: [...rituals, { type: "daily_shutdown", date: "2026-11-13", completedAt: 1 }] })).toEqual(
      [],
    );
  });

  it("only between 10:00 and 20:00, outside quiet hours, and not at Gentle unless switched on", () => {
    const rituals = [{ type: "daily_plan" as const, date: "2026-11-11", completedAt: 1 }];
    expect(kinds({ rituals, now: at("09:59") })).toEqual([]);
    expect(kinds({ rituals, now: at("20:00") })).toEqual([]);
    expect(
      kinds({ rituals, settings: { ...base.settings, quietHours: { start: "10:00", end: "12:00" } } as never }),
    ).toEqual([]);
    expect(kinds({ rituals, settings: { ...base.settings, strictness: "gentle" } as never })).toEqual([]);
    expect(kinds({ rituals, settings: { ...base.settings, strictness: "gentle", aiCheckins: true } as never })).toEqual(
      ["missed_rituals"],
    );
    expect(checkinsEnabled({ strictness: "firm", aiCheckins: false })).toBe(false);
  });

  it("when a task is avoided twice, a goal goes off track, or a cycle is behind at its midpoint", () => {
    const tasks = [
      task("t1", { title: "Call the bank" }),
      task("t2"),
      task("t3", { status: "done" }),
      task("c1", { cycleId: "cy1", effort: 5, status: "done" }),
      task("c2", { cycleId: "cy1", effort: 8 }),
    ];
    const skip = (taskId: string) => ({ taskId, type: "skip" as const, reason: "avoiding", at: 1 });
    const due = dueCheckins({
      ...base,
      tasks,
      taskEvents: [skip("t1"), skip("t1"), skip("t2"), skip("t3"), skip("t3")],
      goals: [{ id: "g1", title: "Get fit", status: "active", health: "off_track", healthSetAt: 5 }],
      cycles: [
        {
          id: "cy1",
          number: 3,
          startDate: "2026-11-08",
          endDate: "2026-11-21",
          committedAt: 1,
          committedTaskIds: ["c1", "c2"],
          committedPts: 13,
        },
      ],
    } as never);
    expect(due.map((c) => c.key)).toEqual(["avoid:t1", "offtrack:g1:5", "cycle:cy1"]);
    expect(due[0].fallback).toContain("Call the bank");
    expect(due[2].facts).toContain("Committed 13 points, done 5");
    // Already sent: not again.
    expect(
      dueCheckins({ ...base, tasks, taskEvents: [skip("t1"), skip("t1")], sent: new Set(["avoid:t1"]) } as never),
    ).toEqual([]);
  });

  it("sends the weekly summary on the last day of the week, from 18:00", () => {
    expect(kinds({ now: at("17:59") })).toEqual([]);
    expect(kinds({ now: at("18:30") })).toEqual(["weekly"]);
    expect(kinds({ now: at("18:30"), settings: { ...base.settings, weekStartDay: 1 } as never })).toEqual([]);
    const done = Date.parse("2026-11-12T12:00:00Z");
    const w = weekFacts({
      today: "2026-11-14",
      timezone: "UTC",
      tasks: [task("a", { status: "done", completedAt: done, effort: 3, title: "Ship the CV" }), task("b")],
      taskEvents: [
        { taskId: "b", type: "skip", reason: "no_time", at: done },
        { taskId: "b", type: "skip", reason: "no_time", at: done },
      ],
      rituals: [{ type: "daily_plan", date: "2026-11-12", completedAt: 1 }],
      xpGained: 120,
    });
    expect(w.facts).toContain("Tasks done: 1 (3 points)");
    expect(w.facts).toContain("reasons: no time 2");
    expect(w.facts).toContain("Daily Plans done: 1 of 7");
    expect(w.fallback).toMatch(/^This week: 1 task done/);
  });
});

describe("check-in delivery (server)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
  });
  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });

  it("writes the check-in as a coach conversation, pushes it, and does it once", async () => {
    process.env.COACH_FAKE = "1";
    db = client.db(`c${Math.random().toString(36).slice(2)}`);
    const userId = "user0000000001";
    await db.collection("settings").insertOne({
      _id: `s${userId}` as never,
      userId,
      timezone: "UTC",
      strictness: "firm",
      weekStartDay: 0,
      onboardingCompletedAt: 1,
      createdAt: Date.parse("2026-11-01T00:00:00Z"),
      deletedAt: null,
    });
    await db.collection("rituals").insertOne({
      _id: "r1" as never,
      userId,
      type: "daily_plan",
      date: "2026-11-11",
      completedAt: 1,
      deletedAt: null,
    });
    await db.collection("pushSubscriptions").insertOne({
      _id: "https://push.example/ok" as never,
      userId,
      keys: { p256dh: "p", auth: "a" },
    });
    const pushed: { title: string; url: string }[] = [];
    const send: Sender = async (_sub, payload) => {
      pushed.push(payload);
      return { ok: true };
    };

    expect(await dispatchCheckins(db, at("10:30"), send)).toEqual({ checkins: 1 });
    const thread = await db.collection("aiThreads").findOne({ userId });
    expect(thread).toMatchObject({ title: "Check-in · two days off the plan", deletedAt: null });
    const messages = await db.collection("aiMessages").find({ threadId: thread!._id }).sort({ seq: 1 }).toArray();
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[0].content[0].text).toMatch(new RegExp(`^\\${CHECKIN_MARK}`));
    expect(messages[1].content[0].text).toMatch(/Two days without a Daily Plan/);
    expect(pushed).toEqual([expect.objectContaining({ url: `/coach?t=${thread!._id}` })]);

    // A minute later, and after the 3-day push log would have expired: never twice.
    expect(await dispatchCheckins(db, at("10:31"), send)).toEqual({ checkins: 0 });
    expect(await db.collection("aiThreads").countDocuments({ userId })).toBe(1);
    delete process.env.COACH_FAKE;
  });
});
