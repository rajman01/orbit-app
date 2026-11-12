import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import {
  burnUp,
  currentCycle,
  cyclePoints,
  cyclesToCreate,
  cycleId,
  cycleState,
  dueRituals,
  firstCycle,
  missedShutdown,
  nextCycle,
  planningGate,
  planningTarget,
  ritualId,
  ritualStreak,
  startOfWeek,
  timeOfDay,
  unfinishedInCycle,
  type Cycle,
} from "@/features/cycles/model";
import { newTaskFields, type Task } from "@/features/tasks/model";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";
import { entitySchemas } from "@/lib/sync/entities";

const USER = "6650a1b2c3d4e5f6a7b8c9d0";
let n = 0;

const cycle = (p: Partial<Cycle>): Cycle =>
  ({
    id: cycleId(USER, p.number ?? 1),
    number: 1,
    startDate: "2026-11-08",
    endDate: "2026-11-21",
    theme: null,
    focusGoalIds: [],
    committedTaskIds: [],
    committedPts: 0,
    committedAt: null,
    planningOverride: null,
    reviewCompletedAt: null,
    reflection: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    serverVersion: 0,
    ...p,
  }) as Cycle;

const task = (p: Partial<Task>): Task =>
  ({
    id: `t${++n}x0000000000`,
    createdAt: Date.UTC(2026, 10, 8),
    updatedAt: Date.UTC(2026, 10, 8),
    deletedAt: null,
    serverVersion: 0,
    ...newTaskFields({ title: `task ${n}`, status: "todo", order: n }),
    ...p,
  }) as Task;

describe("cycle dates", () => {
  it("starts on the week-start day on or before today", () => {
    // Thursday 12 November 2026
    expect(startOfWeek("2026-11-12", 0)).toBe("2026-11-08"); // Sunday
    expect(startOfWeek("2026-11-12", 1)).toBe("2026-11-09"); // Monday
    expect(startOfWeek("2026-11-08", 0)).toBe("2026-11-08"); // already Sunday
    expect(firstCycle("2026-11-12", 0, 14)).toEqual({ number: 1, startDate: "2026-11-08", endDate: "2026-11-21" });
  });

  it("follows on day after day, and a new length applies from the next cycle only", () => {
    const c1 = firstCycle("2026-11-12", 0, 14);
    expect(nextCycle(c1, 14)).toEqual({ number: 2, startDate: "2026-11-22", endDate: "2026-12-05" });
    expect(nextCycle(c1, 7)).toEqual({ number: 2, startDate: "2026-11-22", endDate: "2026-11-28" });
  });

  it("keeps the current cycle and the next one, without recreating existing ones", () => {
    expect(cyclesToCreate([], "2026-11-12", 0, 14).map((c) => [c.number, c.startDate, c.endDate])).toEqual([
      [1, "2026-11-08", "2026-11-21"],
      [2, "2026-11-22", "2026-12-05"],
    ]);
    const both = cyclesToCreate([], "2026-11-12", 0, 14);
    expect(cyclesToCreate(both, "2026-11-20", 0, 14)).toEqual([]);
    // A day into cycle 2, cycle 3 is created for planning ahead.
    expect(cyclesToCreate(both, "2026-11-22", 0, 14).map((c) => c.number)).toEqual([3]);
  });

  it("skips empty periods after a long break, numbering on without gaps", () => {
    const c1 = firstCycle("2026-11-12", 0, 14);
    // Next opened on 20 January: cycle 2 is the period containing that day.
    const made = cyclesToCreate([c1], "2027-01-20", 0, 14);
    expect(made[0]).toMatchObject({ number: 2 });
    expect(made[0].startDate <= "2027-01-20" && "2027-01-20" <= made[0].endDate).toBe(true);
    expect(made[1]).toMatchObject({ number: 3, startDate: nextCycle(made[0], 14).startDate });
  });

  it("is not thrown by daylight-saving changes (dates are calendar days)", () => {
    // Europe moves clocks on 29 March 2026; US on 8 March 2026.
    const c = firstCycle("2026-03-25", 0, 14);
    expect(c).toEqual({ number: 1, startDate: "2026-03-22", endDate: "2026-04-04" });
    expect(nextCycle(c, 14).startDate).toBe("2026-04-05");
  });

  it("states: upcoming, active, review on and after the last day, done once reviewed", () => {
    const c = cycle({});
    expect(cycleState(c, "2026-11-07")).toBe("upcoming");
    expect(cycleState(c, "2026-11-08")).toBe("active");
    expect(cycleState(c, "2026-11-20")).toBe("active");
    expect(cycleState(c, "2026-11-21")).toBe("review");
    expect(cycleState(c, "2026-11-25")).toBe("review");
    expect(cycleState({ ...c, reviewCompletedAt: 1 }, "2026-11-25")).toBe("done");
  });

  it("gives deterministic ids that fit the sync id rules", () => {
    const id = cycleId(USER, 12);
    expect(id).toBe(cycleId(USER, 12));
    expect(id).not.toBe(cycleId(USER, 1));
    expect(id).toMatch(/^[0-9A-Za-z]{10,40}$/);
    // A very long user id loses its tail, never the number.
    expect(cycleId("x".repeat(60), 7)).toMatch(/^c00007/);
    expect(ritualId(USER, "daily_plan", "2026-11-12")).toMatch(/^[0-9A-Za-z]{10,40}$/);
    expect(ritualId(USER, "daily_plan", "2026-11-12")).not.toBe(ritualId(USER, "daily_shutdown", "2026-11-12"));
  });
});

describe("planning", () => {
  const c1 = cycle({ number: 1 });
  const c2 = cycle({ number: 2, startDate: "2026-11-22", endDate: "2026-12-05" });

  it("plans the current cycle until it's committed, then the next one", () => {
    expect(planningTarget([c1, c2], "2026-11-12")?.number).toBe(1);
    expect(planningTarget([{ ...c1, committedAt: 1 }, c2], "2026-11-12")?.number).toBe(2);
  });

  it("a missed review blocks planning: Firm allows an override with a reason, Strict doesn't, Gentle never blocks", () => {
    const after = "2026-11-23";
    expect(planningGate([c1, c2], c2, after, "firm")).toMatchObject({ blocked: true, canOverride: true });
    expect(planningGate([c1, c2], c2, after, "strict")).toMatchObject({ blocked: true, canOverride: false });
    expect(planningGate([c1, c2], c2, after, "gentle")).toEqual({ blocked: false });
    // Review day itself: planning the next cycle is part of the review.
    expect(planningGate([c1, c2], c2, "2026-11-21", "firm")).toEqual({ blocked: false });
    // Reviewed: not blocked.
    expect(planningGate([{ ...c1, reviewCompletedAt: 1 }, c2], c2, after, "strict")).toEqual({ blocked: false });
    // Overridden with a reason: Firm lets it through, Strict still blocks.
    const overridden = { ...c2, planningOverride: "Travelling" };
    expect(planningGate([c1, overridden], overridden, after, "firm")).toEqual({ blocked: false });
    expect(planningGate([c1, overridden], overridden, after, "strict")).toMatchObject({ blocked: true });
  });

  it("counts committed, added mid-cycle and done points", () => {
    const a = task({ cycleId: c1.id, effort: 3, status: "done", completedAt: Date.UTC(2026, 10, 10) });
    const b = task({ cycleId: c1.id, effort: 5 });
    const added = task({ cycleId: c1.id, effort: 2 });
    const cancelled = task({ cycleId: c1.id, effort: 8, status: "cancelled" });
    const other = task({ effort: 8 });
    const c = { ...c1, committedTaskIds: [a.id, b.id], committedPts: 8 };
    expect(cyclePoints([a, b, added, cancelled, other], c)).toEqual({
      committed: 8,
      added: 2,
      done: 3,
      total: 10,
      tasks: 3,
      doneTasks: 1,
    });
    expect(unfinishedInCycle([a, b, added, cancelled, other], c1.id).map((t) => t.id)).toEqual([b.id, added.id]);
  });

  it("burn-up: scope grows on the day work is added, done grows on completion days, none in the future", () => {
    const a = task({ cycleId: c1.id, effort: 3, status: "done", completedAt: Date.UTC(2026, 10, 10, 15) });
    const b = task({ cycleId: c1.id, effort: 5 });
    const added = task({ cycleId: c1.id, effort: 2 });
    const c = { ...c1, committedTaskIds: [a.id, b.id], committedPts: 8 };
    const points = burnUp([a, b, added], c, new Map([[added.id, Date.UTC(2026, 10, 11, 9)]]), "2026-11-12", "UTC");
    expect(points).toHaveLength(14);
    expect(points.slice(0, 5).map((p) => [p.scope, p.done])).toEqual([
      [8, 0],
      [8, 0],
      [8, 3],
      [10, 3],
      [10, 3],
    ]);
    expect(points[5].done).toBeNull();
  });
});

describe("rituals", () => {
  const times = { plan: "07:30", shutdown: "21:00", review: "18:00" };
  const c1 = cycle({});

  it("Daily Plan is due until done; Shutdown from its time; Review from its time on the last day", () => {
    const base = { rituals: [], cycles: [c1], times };
    expect(dueRituals({ ...base, today: "2026-11-12", time: "06:00" }).map((r) => r.type)).toEqual(["daily_plan"]);
    expect(dueRituals({ ...base, today: "2026-11-12", time: "21:30" }).map((r) => r.type)).toEqual([
      "daily_plan",
      "daily_shutdown",
    ]);
    expect(dueRituals({ ...base, today: "2026-11-21", time: "17:00" }).map((r) => r.type)).toEqual(["daily_plan"]);
    expect(dueRituals({ ...base, today: "2026-11-21", time: "18:00" }).map((r) => r.type)).toEqual([
      "cycle_review",
      "daily_plan",
    ]);
    const done = [
      { type: "daily_plan" as const, date: "2026-11-12", completedAt: 1 },
      { type: "daily_shutdown" as const, date: "2026-11-12", completedAt: 2 },
    ];
    expect(dueRituals({ ...base, rituals: done, today: "2026-11-12", time: "22:00" })).toEqual([]);
  });

  it("an unreviewed cycle stays due on later days, marked as missed", () => {
    const due = dueRituals({ rituals: [], cycles: [c1], times, today: "2026-11-24", time: "09:00" });
    expect(due[0]).toEqual({ type: "cycle_review", date: "2026-11-21", missed: true });
  });

  it("a skipped shutdown is carried into the next morning's plan", () => {
    const planned = [{ type: "daily_plan" as const, date: "2026-11-11", completedAt: 1 }];
    expect(missedShutdown(planned, "2026-11-12")).toBe(true);
    expect(
      missedShutdown(
        [...planned, { type: "daily_shutdown" as const, date: "2026-11-11", completedAt: 2 }],
        "2026-11-12",
      ),
    ).toBe(false);
    // Orbit wasn't used yesterday at all: nothing to carry over.
    expect(missedShutdown([], "2026-11-12")).toBe(false);
  });

  it("counts streaks of consecutive days, still alive before today's is done", () => {
    const done = (date: string) => ({ type: "daily_plan" as const, date, completedAt: 1 });
    const rituals = [done("2026-11-09"), done("2026-11-10"), done("2026-11-11")];
    expect(ritualStreak(rituals, "daily_plan", "2026-11-12")).toBe(3);
    expect(ritualStreak([...rituals, done("2026-11-12")], "daily_plan", "2026-11-12")).toBe(4);
    expect(ritualStreak(rituals, "daily_plan", "2026-11-13")).toBe(0);
    expect(ritualStreak(rituals, "daily_shutdown", "2026-11-12")).toBe(0);
  });

  it("reads the time of day in the user's timezone", () => {
    const instant = Date.UTC(2026, 10, 12, 20, 30);
    expect(timeOfDay(instant, "UTC")).toBe("20:30");
    expect(timeOfDay(instant, "Africa/Lagos")).toBe("21:30");
    expect(timeOfDay(instant, "America/New_York")).toBe("15:30");
  });
});

describe("cycle and ritual actions on the local database", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 12, 9));
  });
  afterEach(() => vi.useRealTimers());

  async function setup() {
    const db = openLocalDb(`cycles-${Math.random().toString(36).slice(2)}`);
    const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
    const actions = createActions(engine, USER);
    await actions.saveSettings({ timezone: "UTC", weekStartDay: 0, cycleLengthDays: 14, cycleCapacityPts: 30 });
    return { db, engine, actions };
  }

  it("creates cycles once, with valid documents, even if asked twice at the same time", async () => {
    const { db, actions } = await setup();
    await Promise.all([actions.ensureCycles("2026-11-12"), actions.ensureCycles("2026-11-12")]);
    const cycles = await db.cycles.toArray();
    expect(cycles.map((c) => c.number).sort()).toEqual([1, 2]);
    for (const c of cycles) {
      const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, serverVersion: _v, ...fields } = c;
      expect(entitySchemas.cycles.strict().safeParse(fields).success).toBe(true);
    }
    expect(currentCycle(cycles, "2026-11-12")?.number).toBe(1);
  });

  it("plan, commit, then review: every unfinished task is rolled over, sent back or cancelled", async () => {
    const { db, actions } = await setup();
    await actions.ensureCycles("2026-11-12");
    const [c1, c2] = (await db.cycles.toArray()).sort((a, b) => a.number - b.number);
    const ids = await Promise.all(
      ["Roll me", "Back to backlog", "Cancel me", "Done already"].map((title) =>
        actions.createTask({ title, status: "backlog", effort: 2 }),
      ),
    );
    for (const id of ids) await actions.addToCycle((await db.tasks.get(id))!, c1);
    expect((await db.tasks.get(ids[0]))!.status).toBe("todo");
    await actions.commitCycle(c1, { taskIds: ids, points: 8, theme: "  Get started ", focusGoalIds: [] });
    expect(await db.cycles.get(c1.id)).toMatchObject({ committedPts: 8, theme: "Get started" });
    await actions.setTaskDone((await db.tasks.get(ids[3]))!, true);

    const get = async (i: number) => (await db.tasks.get(ids[i]))!;
    await actions.decideRollover(await get(0), "rollover", { next: c2, reason: "Ran out of time" });
    await actions.decideRollover(await get(1), "backlog", {});
    await actions.decideRollover(await get(2), "cancel", { reason: "Not needed" });
    expect(unfinishedInCycle(await db.tasks.toArray(), c1.id)).toEqual([]);
    expect(await get(0)).toMatchObject({ cycleId: c2.id, status: "todo" });
    expect(await get(1)).toMatchObject({ cycleId: null, status: "backlog" });
    expect((await get(2)).status).toBe("cancelled");
    const events = (await db.taskEvents.toArray()).filter((e) => e.reason?.startsWith("rollover_"));
    expect(events.map((e) => [e.reason, e.reasonText]).sort()).toEqual([
      ["rollover_backlog", null],
      ["rollover_cancel", "Not needed"],
      ["rollover_rollover", "Ran out of time"],
    ]);
    await actions.completeReview(c1, "Went well: started");
    expect(cycleState((await db.cycles.get(c1.id))!, "2026-11-22")).toBe("done");
  });

  it("a ritual has one document per day that keeps its progress and answers", async () => {
    const { db, actions } = await setup();
    const id = await actions.startRitual("daily_shutdown", "2026-11-12");
    expect(await actions.startRitual("daily_shutdown", "2026-11-12")).toBe(id);
    await actions.saveRitual(id, { step: 2, mood: 4 });
    await actions.saveRitual(id, { energy: 3 });
    await actions.completeRitual(id, { note: "Good day" });
    const r = (await db.rituals.get(id))!;
    expect(r.data).toEqual({ step: 2, mood: 4, energy: 3, note: "Good day" });
    expect(r.completedAt).not.toBeNull();
    expect(await db.rituals.count()).toBe(1);
  });
});
