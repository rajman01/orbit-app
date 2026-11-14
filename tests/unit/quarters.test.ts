import "fake-indexeddb/auto";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { coachContext, runCoachTool } from "@/features/coach/device";
import {
  addQuarters,
  cyclesInQuarter,
  elapsedShare,
  newQuarterFields,
  pace,
  parseQuarterKey,
  quarterDates,
  quarterDaysLeft,
  quarterId,
  quarterKey,
  quarterOf,
  visionId,
  yearTheme,
} from "@/features/quarters/model";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";
import { applyMutations } from "@/lib/sync/server";

vi.mock("server-only", () => ({}));
const USER = "user0000000001";

describe("quarters (QTR-1)", () => {
  it("are calendar quarters with stable ids and keys", () => {
    expect(quarterOf("2026-11-14")).toEqual({ year: 2026, q: 4 });
    expect(quarterOf("2026-01-01")).toEqual({ year: 2026, q: 1 });
    expect(quarterOf("2026-03-31")).toEqual({ year: 2026, q: 1 });
    expect(quarterOf("2026-04-01")).toEqual({ year: 2026, q: 2 });
    expect(quarterDates({ year: 2028, q: 1 })).toEqual({ startDate: "2028-01-01", endDate: "2028-03-31" });
    expect(quarterDates({ year: 2026, q: 4 })).toEqual({ startDate: "2026-10-01", endDate: "2026-12-31" });
    expect(addQuarters({ year: 2026, q: 4 }, 1)).toEqual({ year: 2027, q: 1 });
    expect(addQuarters({ year: 2026, q: 1 }, -1)).toEqual({ year: 2025, q: 4 });
    expect(quarterKey({ year: 2026, q: 4 })).toBe("2026-Q4");
    expect(parseQuarterKey("2026-Q4")).toEqual({ year: 2026, q: 4 });
    expect(parseQuarterKey("2026-Q5")).toBeNull();
    expect(quarterId(USER, { year: 2026, q: 4 })).toBe(`q20264${USER}`);
  });

  it("measures time gone and pace (behind = progress trails time by more than 20 points)", () => {
    const q4 = quarterDates({ year: 2026, q: 4 });
    expect(elapsedShare(q4, "2026-09-30")).toBe(0);
    expect(elapsedShare(q4, "2026-12-31")).toBe(1);
    expect(Math.round(elapsedShare(q4, "2026-11-14") * 100)).toBe(49);
    expect(quarterDaysLeft(q4, "2026-11-14")).toBe(47);
    expect(pace(0.25, 0.49)).toBe("behind");
    expect(pace(0.3, 0.49)).toBe("on_pace");
    expect(pace(0, 0.2)).toBe("on_pace");
    const cycles = [{ startDate: "2026-09-28" }, { startDate: "2026-10-12" }, { startDate: "2026-12-21" }];
    expect(cyclesInQuarter(cycles, q4)).toEqual([{ startDate: "2026-10-12" }, { startDate: "2026-12-21" }]);
  });
});

describe("vision and quarter actions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 14, 9));
  });
  afterEach(() => vi.useRealTimers());

  function setup() {
    const db = openLocalDb(`q-${Math.random().toString(36).slice(2)}`);
    const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
    const actions = createActions(engine, USER);
    return { db, engine, actions, deps: { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } } };
  }

  it("saves the vision and a theme per year", async () => {
    const { db, actions } = setup();
    await actions.saveVision({ values: [{ id: "fam001", name: "Family", description: "Be there" }] });
    await actions.setYearTheme(2026, " Build the foundation ");
    await actions.setYearTheme(2027, "Grow");
    await actions.setYearTheme(2026, "Lay the foundation");
    const v = await db.vision.get(visionId(USER));
    expect(v).toMatchObject({ values: [{ name: "Family" }], oneYear: "" });
    expect(v?.themes).toEqual([
      { year: 2026, theme: "Lay the foundation" },
      { year: 2027, theme: "Grow" },
    ]);
    expect(yearTheme(v, 2027)).toBe("Grow");
    await actions.setYearTheme(2027, "");
    expect(yearTheme(await db.vision.get(visionId(USER)), 2027)).toBe("");
  });

  it("makes a quarter on first use and keeps its goals unique; the coach sees it", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    await actions.saveVision({ values: [{ id: "fam001", name: "Family", description: "" }] });
    await actions.setYearTheme(2026, "Foundation");
    const behind = await actions.createGoal({ title: "Ship the portfolio", status: "active" });
    const fine = await actions.createGoal({ title: "Run 10k", status: "active" });
    await actions.createTask({ title: "Sketch", goalId: behind, status: "todo" });
    const done = await actions.createTask({ title: "Run 5k", goalId: fine, status: "todo" });
    await actions.updateTask((await db.tasks.get(done))!, { status: "done" });
    const ref = { year: 2026, q: 4 };
    const id = await actions.ensureQuarter(ref);
    expect(await actions.ensureQuarter(ref)).toBe(id);
    await actions.setQuarterGoals(ref, [behind, fine, behind]);
    await actions.updateQuarter(ref, { theme: "Get hired" });
    expect(await db.quarters.get(id)).toMatchObject({ goalIds: [behind, fine], theme: "Get hired", year: 2026, q: 4 });

    const o = JSON.parse((await runCoachTool("get_overview", {}, deps)).content);
    expect(o.quarter).toMatchObject({
      name: "Q4 2026",
      daysLeft: 47,
      theme: "Get hired",
      goals: [
        { title: "Ship the portfolio", progress: 0, pace: "behind" },
        { title: "Run 10k", progress: 100, pace: "on pace" },
      ],
    });
    const ctx = await coachContext(db, USER, Date.now());
    expect(ctx).toContain('Their theme for 2026: "Foundation".');
    expect(ctx).toContain("Their values: Family.");
  });
});

describe("quarters on the server", () => {
  it("refuses a quarter that lists another account's goal", async () => {
    const mongod = await MongoMemoryServer.create();
    const client = await MongoClient.connect(mongod.getUri());
    try {
      const db = client.db("q");
      const goal = "01GOAL0000000001";
      const m = (entity: string, entityId: string, fields: Record<string, unknown>, n: number) => ({
        mutationId: `01MUTQ${String(n).padStart(10, "0")}`,
        entity,
        entityId,
        op: "upsert" as const,
        fields,
        clientTime: 1000 + n,
      });
      const goalFields = {
        areaId: null,
        title: "Mine",
        description: "",
        status: "active",
        health: null,
        priority: "none",
        startDate: null,
        targetDate: null,
        droppedReason: null,
        completedAt: null,
        order: 1,
      };
      expect((await applyMutations(db, "u1", [m("goals", goal, goalFields, 1)] as never)).applied).toHaveLength(1);
      const q = { ...newQuarterFields({ year: 2026, q: 4 }), goalIds: [goal] };
      expect((await applyMutations(db, "u2", [m("quarters", "q20264u2xxxxxxxx", q, 2)] as never)).applied).toHaveLength(
        0,
      );
      expect((await applyMutations(db, "u1", [m("quarters", "q20264u1xxxxxxxx", q, 3)] as never)).applied).toHaveLength(
        1,
      );
    } finally {
      await client.close();
      await mongod.stop();
    }
  });
});
