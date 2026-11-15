import "fake-indexeddb/auto";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Cycle } from "@/features/cycles/model";
import type { Goal } from "@/features/goals/model";
import {
  areaHealth,
  cycleTrend,
  doneByArea,
  focusByWeek,
  headlines,
  insightRange,
  moodVsDone,
  postponementsBeforeDone,
  ratingId,
  ritualConsistency,
  skipInsights,
  staleTrend,
  startingScores,
  timeVsValues,
  xpByWeek,
  type AreaRating,
} from "@/features/insights/model";
import { newTaskFields, type Task } from "@/features/tasks/model";
import { applyMutations } from "@/lib/sync/server";
import { createActions } from "@/features/actions";
import { runCoachTool } from "@/features/coach/device";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

vi.mock("server-only", () => ({}));

const TZ = "UTC";
const TODAY = "2026-11-25"; // a Wednesday, day 4 of cycle 3
const at = (day: string, time = "10:00") => Date.parse(`${day}T${time}:00Z`);
const meta = { createdAt: 0, updatedAt: 0, deletedAt: null, serverVersion: 0 };

const cycle = (number: number, startDate: string, endDate: string, p: Partial<Cycle> = {}): Cycle =>
  ({
    id: `cycle${number}`,
    number,
    startDate,
    endDate,
    theme: null,
    focusGoalIds: [],
    committedTaskIds: [],
    committedPts: 0,
    committedAt: null,
    planningOverride: null,
    reviewCompletedAt: null,
    reflection: null,
    ...meta,
    ...p,
  }) as Cycle;
const CYCLES = [
  cycle(1, "2026-10-25", "2026-11-07"),
  cycle(2, "2026-11-08", "2026-11-21"),
  cycle(3, "2026-11-22", "2026-12-05"),
  cycle(4, "2026-12-06", "2026-12-19"),
];

let n = 0;
const task = (p: Partial<Task>): Task =>
  ({ ...newTaskFields({ title: "T", status: "todo" }), id: `t${++n}`, ...meta, ...p }) as Task;
const skip = (taskId: string, day: string, reason: string | null = "no_time") => ({
  taskId,
  type: "skip" as const,
  reason,
  at: at(day),
  deletedAt: null,
});

describe("range and INS-1", () => {
  it("takes the last n cycles up to today", () => {
    const r = insightRange(CYCLES, TODAY, 2);
    expect(r.cycles.map((c) => c.number)).toEqual([2, 3]);
    expect([r.from, r.to]).toEqual(["2026-11-08", TODAY]);
    expect(insightRange(CYCLES, TODAY, 13).cycles).toHaveLength(3);
  });

  it("completion, focus and XP per cycle, and focus by week", () => {
    const r = insightRange(CYCLES, TODAY, 3);
    const tasks = [
      task({ id: "a", cycleId: "cycle2", effort: 3, status: "done", completedAt: at("2026-11-10") }),
      task({ id: "b", cycleId: "cycle2", effort: 1 }),
      task({ id: "c", cycleId: "cycle3", effort: 2 }),
    ];
    const sessions = [
      { taskId: "a", startedAt: at("2026-11-10"), actualMinutes: 90, deletedAt: null },
      { taskId: "a", startedAt: at("2026-11-23"), actualMinutes: 30, deletedAt: null },
      { taskId: "a", startedAt: at("2026-11-24"), actualMinutes: 60, deletedAt: 1 }, // deleted
    ];
    const xp = [{ at: at("2026-11-10"), amount: 20, deletedAt: null }];
    const trend = cycleTrend(r, tasks, sessions, xp, TZ, TODAY);
    expect(trend.map((c) => [c.number, Math.round(c.completion * 100), c.focusHours, c.xp, c.current])).toEqual([
      [1, 0, 0, 0, false],
      [2, 75, 1.5, 20, false],
      [3, 0, 0.5, 0, true],
    ]);
    // Weeks start Sunday.
    const weeks = focusByWeek(sessions, r, TZ, 0);
    expect(weeks[0].week).toBe("2026-10-25");
    expect(weeks.find((w) => w.week === "2026-11-08")!.hours).toBe(1.5);
    expect(weeks.find((w) => w.week === "2026-11-22")!.hours).toBe(0.5);
  });

  it("tasks done per area, ritual consistency and XP over time", () => {
    const r = insightRange(CYCLES, TODAY, 2); // 8 Nov – 25 Nov: 18 days
    const done = (areaId: string | null, day: string, p: Partial<Task> = {}) =>
      task({ areaId, status: "done", completedAt: at(day), effort: 2, ...p });
    const tasks = [
      done("career", "2026-11-09"),
      done("career", "2026-11-20"),
      done("health", "2026-11-12"),
      done(null, "2026-11-13"),
      done("career", "2026-11-01"), // before the range
      done("career", "2026-11-14", { parentTaskId: "x" }), // a subtask
    ];
    expect(doneByArea(tasks, r, TZ)).toEqual([
      { areaId: "career", count: 2, points: 4 },
      { areaId: "health", count: 1, points: 2 },
      { areaId: null, count: 1, points: 2 },
    ]);

    const ritual = (
      type: "daily_plan" | "daily_shutdown" | "cycle_review",
      date: string,
      cycleId: string | null = null,
    ) => ({
      type,
      date,
      cycleId,
      completedAt: 1,
      deletedAt: null,
    });
    const rituals = [
      ...["2026-11-08", "2026-11-09", "2026-11-10"].map((d) => ritual("daily_plan", d)),
      ritual("daily_plan", TODAY),
      ritual("daily_shutdown", "2026-11-09"),
      ritual("cycle_review", "2026-11-21", "cycle2"),
    ];
    const c = ritualConsistency(rituals, r, TODAY);
    expect(c.plan).toEqual({ done: 4, of: 18 }); // today counts, as it's done
    expect(c.shutdown).toEqual({ done: 1, of: 17 }); // today doesn't yet
    expect(c.review).toEqual({ done: 1, of: 1 });

    const weeks = xpByWeek(
      [
        { at: at("2026-11-01"), amount: 100, deletedAt: null },
        { at: at("2026-11-09"), amount: 30, deletedAt: null },
        { at: at("2026-11-23"), amount: 10, deletedAt: null },
      ],
      r,
      TZ,
      0,
    );
    expect(weeks.map((w) => [w.week, w.xp, w.total])).toEqual([
      ["2026-11-08", 30, 130],
      ["2026-11-15", 0, 130],
      ["2026-11-22", 10, 140],
    ]);
  });
});

describe("procrastination (INS-2)", () => {
  const r = insightRange(CYCLES, TODAY, 2);
  const tasks = [
    task({ id: "s1", areaId: "career", goalId: "g1", postponeCount: 3 }),
    task({ id: "s2", areaId: "career", goalId: "g1", status: "done", completedAt: at("2026-11-24"), postponeCount: 1 }),
    task({ id: "s3", areaId: "health", status: "done", completedAt: at("2026-11-20"), postponeCount: 0 }),
  ];
  const events = [
    skip("s1", "2026-11-09"), // Monday
    skip("s1", "2026-11-16", "avoiding"), // Monday
    skip("s1", "2026-11-23", "avoiding"), // Monday → stale from here
    skip("s2", "2026-11-18", "too_big"),
    skip("s2", "2026-10-30"), // before the range
    { taskId: "s1", type: "reschedule" as const, reason: null, at: at("2026-11-10"), deletedAt: null },
  ];

  it("reasons, areas, goals and days", () => {
    const s = skipInsights(events, tasks, r, TZ);
    expect(s.total).toBe(4);
    expect(s.reasons).toEqual([
      { reason: "avoiding", count: 2 },
      { reason: "no_time", count: 1 },
      { reason: "too_big", count: 1 },
    ]);
    expect(s.areas).toEqual([{ areaId: "career", count: 4 }]);
    expect(s.goals).toEqual([{ goalId: "g1", count: 4 }]);
    expect(s.weekdays).toEqual([0, 3, 0, 1, 0, 0, 0]);
    expect(
      headlines({
        trend: [],
        skips: s,
        reasonLabel: (id) => (id === "avoiding" ? "Avoiding it" : id),
        areaName: (id) => (id === "career" ? "Career" : "No area"),
      }),
    ).toEqual([
      "The most common reason for skipping is “Avoiding it” (2 of 4).",
      "Career is skipped most (4×).",
      "Most skips happen on Mondays.",
    ]);
  });

  it("postponements before done, and the stale trend by week", () => {
    expect(postponementsBeforeDone(tasks, r, TZ)).toEqual({ tasks: 2, average: 0.5, firstTime: 0.5 });
    expect(staleTrend(tasks, events, r, TZ, 0).map((w) => [w.week, w.count])).toEqual([
      ["2026-11-08", 0],
      ["2026-11-15", 0],
      ["2026-11-22", 1],
    ]);
    // Once it's done, it isn't stale any more.
    const doneLater = tasks.map((t) =>
      t.id === "s1" ? { ...t, status: "done" as const, completedAt: at("2026-11-24") } : t,
    );
    expect(staleTrend(doneLater, events, r, TZ, 0).at(-1)!.count).toBe(0);
  });
});

describe("area health (AREA-3)", () => {
  const now = at(TODAY, "12:00");
  const goal = (p: Partial<Goal>) =>
    ({ id: "g", areaId: "career", title: "Get promoted", status: "active", health: "on_track", ...meta, ...p }) as Goal;
  const base = { today: TODAY, now, tz: TZ };

  it("is green when things are moving", () => {
    const h = areaHealth("career", {
      ...base,
      goals: [goal({})],
      tasks: [task({ areaId: "career", status: "done", completedAt: at("2026-11-24") })],
    });
    expect(h).toMatchObject({ level: "green", reasons: [], quietDays: 1 });
  });

  it("goes amber, then red, with reasons", () => {
    const overdue = (k: number) =>
      Array.from({ length: k }, () => task({ areaId: "career", dueDate: "2026-11-20", updatedAt: now }));
    const recent = task({ areaId: "career", status: "done", completedAt: at("2026-11-24") });
    expect(
      areaHealth("career", { ...base, goals: [goal({ health: "at_risk" })], tasks: [recent, ...overdue(1)] }),
    ).toMatchObject({
      level: "amber",
      reasons: ["“Get promoted” is at risk", "1 overdue task"],
    });
    expect(areaHealth("career", { ...base, goals: [goal({})], tasks: [recent, ...overdue(4)] })).toMatchObject({
      level: "red",
      reasons: ["4 overdue tasks"],
    });
    expect(areaHealth("career", { ...base, goals: [goal({ health: "off_track" })], tasks: [recent] }).level).toBe(
      "red",
    );
    // Quiet: 15 days → amber, 22 → red, never → red; but only when it has active goals.
    const quiet = (day: string) => task({ areaId: "career", status: "done", completedAt: at(day) });
    expect(areaHealth("career", { ...base, goals: [goal({})], tasks: [quiet("2026-11-10")] })).toMatchObject({
      level: "amber",
      reasons: ["Nothing done in 15 days"],
    });
    expect(areaHealth("career", { ...base, goals: [goal({})], tasks: [quiet("2026-11-03")] }).level).toBe("red");
    // Nothing done yet: counted from when the goal began, so a new goal isn't "neglected".
    expect(areaHealth("career", { ...base, goals: [goal({ createdAt: at("2026-11-24") })], tasks: [] }).level).toBe(
      "green",
    );
    expect(areaHealth("career", { ...base, goals: [goal({ createdAt: at("2026-11-01") })], tasks: [] })).toMatchObject({
      level: "red",
      reasons: ["Nothing done since its goals began, 24 days ago"],
    });
    expect(areaHealth("career", { ...base, goals: [], tasks: [] }).level).toBe("green");
  });
});

describe("Wheel of Life and time vs values (AREA-4, INS-3)", () => {
  it("carries over the last rating and compares focus with importance", () => {
    expect(ratingId("user0000000001", "2026-11-25")).toBe("r20261125user0000000001");
    const last = {
      id: "r1",
      date: "2026-11-01",
      note: "",
      scores: [
        { areaId: "career", score: 6, importance: 9 },
        { areaId: "health", score: 4, importance: 6 },
      ],
      ...meta,
    } as AreaRating;
    expect(startingScores([{ id: "career" }, { id: "health" }, { id: "home" }], last)).toEqual([
      { areaId: "career", score: 6, importance: 9 },
      { areaId: "health", score: 4, importance: 6 },
      { areaId: "home", score: 5, importance: 5 },
    ]);

    const r = insightRange(CYCLES, TODAY, 2);
    const tasks = [task({ id: "c1", areaId: "career" }), task({ id: "h1", areaId: "health" })];
    const sessions = [
      { taskId: "c1", startedAt: at("2026-11-10"), actualMinutes: 300, deletedAt: null },
      { taskId: "h1", startedAt: at("2026-11-11"), actualMinutes: 100, deletedAt: null },
    ];
    const tv = timeVsValues(sessions, tasks, last, r, TZ);
    expect(
      tv.map((x) => [x.areaId, x.minutes, Math.round(x.focusShare * 100), Math.round(x.importanceShare * 100), x.gap]),
    ).toEqual([
      ["career", 300, 75, 60, 15],
      ["health", 100, 25, 40, -15],
    ]);
    expect(timeVsValues(sessions, tasks, undefined, r, TZ)).toEqual([]);
  });
});

describe("mood and energy (INS-4)", () => {
  it("averages tasks done and focus on days with each rating", () => {
    const r = insightRange(CYCLES, TODAY, 2);
    const journal = [
      { date: "2026-11-09", mood: 4, energy: 2, deletedAt: null },
      { date: "2026-11-10", mood: 4, energy: null, deletedAt: null },
      { date: "2026-11-11", mood: 2, energy: 2, deletedAt: null },
    ];
    const tasks = [
      task({ status: "done", completedAt: at("2026-11-09") }),
      task({ status: "done", completedAt: at("2026-11-09") }),
      task({ status: "done", completedAt: at("2026-11-10") }),
    ];
    const sessions = [{ taskId: "x", startedAt: at("2026-11-11"), actualMinutes: 45, deletedAt: null }];
    const m = moodVsDone(journal, tasks, sessions, r, TZ);
    expect(m.rated).toBe(3);
    expect(m.enough).toBe(false);
    expect(m.mood[3]).toEqual({ level: 4, days: 2, done: 1.5, focusMinutes: 0 });
    expect(m.mood[1]).toEqual({ level: 2, days: 1, done: 0, focusMinutes: 45 });
    expect(m.mood[0]).toEqual({ level: 1, days: 0, done: null, focusMinutes: null });
    expect(m.energy[1]).toMatchObject({ days: 2, done: 1 });
  });
});

describe("ratings on the server", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    db = client.db("ratings");
  });
  afterAll(async () => {
    await client?.close();
    await mongod?.stop();
  });

  it("can't point at another user's areas", async () => {
    const area = (userId: string, id: string) =>
      applyMutations(db, userId, [
        {
          mutationId: `01MUTRAT${id}`,
          entity: "areas",
          entityId: id,
          op: "upsert",
          fields: { name: "A", icon: "circle", color: "blue", description: "", order: 0, archivedAt: null },
          clientTime: Date.now(),
        },
      ]);
    await area("user0000000001", "area000000001");
    await area("user0000000002", "area000000002");
    const rate = (areaId: string) =>
      applyMutations(db, "user0000000001", [
        {
          mutationId: `01MUTRATE${areaId}`,
          entity: "areaRatings",
          entityId: ratingId("user0000000001", "2026-11-25"),
          op: "upsert",
          fields: { date: "2026-11-25", note: "", scores: [{ areaId, score: 7, importance: 8 }] },
          clientTime: Date.now(),
        },
      ]);
    expect((await rate("area000000001")).applied).toHaveLength(1);
    expect((await rate("area000000002")).rejected[0].reason).toMatch(/forbidden reference/);
  });
});

describe("coach: get_insights, and saving a rating", () => {
  it("summarises the cycles, skips, area health and the Wheel of Life", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 25, 12));
    try {
      const USER = "user0000000001";
      const db = openLocalDb(`ins-${Math.random().toString(36).slice(2)}`);
      const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
      const actions = createActions(engine, USER);
      const deps = { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } };
      await actions.saveSettings({ timezone: "UTC", weekStartDay: 0, cycleLengthDays: 14 });
      await actions.ensureCycles("2026-11-25");
      const area = await actions.createArea({ name: "Career" });
      const id = await actions.createTask({
        title: "Update CV",
        status: "todo",
        areaId: area,
        scheduledDate: "2026-11-25",
      });
      await actions.skipTask((await db.tasks.get(id))!, {
        reason: "avoiding",
        to: "2026-11-26",
        todayDay: "2026-11-25",
      });

      // Rating twice on one day keeps one rating.
      const scores = [{ areaId: area, score: 4, importance: 9 }];
      const r1 = await actions.saveAreaRating("2026-11-25", { scores, note: "" });
      const r2 = await actions.saveAreaRating("2026-11-25", { scores: [{ ...scores[0], score: 5 }], note: "Better" });
      expect(r1).toBe(r2);
      expect(await db.areaRatings.count()).toBe(1);
      expect((await db.areaRatings.get(r1))!.scores[0].score).toBe(5);

      const out = JSON.parse((await runCoachTool("get_insights", {}, deps)).content);
      expect(out.skips).toMatchObject({
        total: 1,
        reasons: [{ reason: "Avoiding it", count: 1 }],
        areas: [{ area: "Career", count: 1 }],
      });
      expect(out.cycles.at(-1).planFinished).toMatch(/so far \(current\)/);
      expect(out.areaHealth).toEqual([{ area: "Career", health: "green" }]);
      expect(out.wheelOfLife).toMatchObject({
        ratedOn: "2026-11-25",
        areas: [{ area: "Career", going: "5/10", matters: "9/10" }],
      });
      expect(out.moodAndEnergy).toMatch(/at least 7/);
    } finally {
      vi.useRealTimers();
    }
  });
});
