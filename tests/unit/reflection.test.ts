import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { runCoachTool } from "@/features/coach/device";
import { undoAction } from "@/features/coach/write-tools";
import { cycleStats } from "@/features/cycles/model";
import { consistency, habitHeatmap } from "@/features/habits/model";
import { journalId, withLine } from "@/features/journal/model";
import { newTaskFields } from "@/features/tasks/model";
import { ritualWinId, taskWinId, winsMarkdown } from "@/features/wins/model";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

vi.mock("server-only", () => ({}));
const USER = "user0000000001";

function setup() {
  const db = openLocalDb(`refl-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
  const actions = createActions(engine, USER);
  return { db, engine, actions, deps: { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 14, 20));
});
afterEach(() => vi.useRealTimers());

describe("journal (JRN-1)", () => {
  it("has one entry per day that the Shutdown fills in", async () => {
    const { db, actions } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    expect(journalId(USER, "2026-11-14")).toBe(`j20261114${USER}`);
    expect(withLine("", "Sent the CV")).toBe("Sent the CV");
    expect(withLine("Long day.", "Sent the CV")).toBe("Long day.\n\nSent the CV");
    expect(withLine("Long day.\n\nSent the CV", "Sent the CV")).toBe("Long day.\n\nSent the CV");

    await actions.saveJournal("2026-11-14", { text: "Long day." });
    await actions.journalFromShutdown("2026-11-14", { mood: 4 });
    await actions.journalFromShutdown("2026-11-14", { mood: 4, energy: 2, note: " Sent the CV " });
    await actions.journalFromShutdown("2026-11-14", { mood: 4, energy: 2, note: "Sent the CV" });
    expect(await db.journalEntries.get(journalId(USER, "2026-11-14"))).toMatchObject({
      date: "2026-11-14",
      text: "Long day.\n\nSent the CV",
      mood: 4,
      energy: 2,
      prompts: [],
    });
  });
});

describe("wins (CAR-1)", () => {
  it("logs a task once, review wins once each, and exports markdown", async () => {
    const { db, actions } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const goal = await actions.createGoal({ title: "Land a role", status: "active" });
    const taskId = await actions.createTask({ title: "Send 10 applications", goalId: goal, status: "todo" });
    await actions.updateTask((await db.tasks.get(taskId))!, { status: "done" });
    const task = (await db.tasks.get(taskId))!;
    const id = await actions.logTaskAsWin({ ...newTaskFields({ title: "x" }), ...task });
    expect(id).toBe(taskWinId(taskId));
    await actions.logTaskAsWin({ ...newTaskFields({ title: "x" }), ...task });
    expect((await db.wins.toArray()).filter((w) => !w.deletedAt)).toMatchObject([
      { title: "Send 10 applications", goalId: goal, taskId, date: "2026-11-14", source: "task" },
    ]);

    const ritual = await actions.startRitual("cycle_review", "2026-11-14");
    await actions.completeRitual(ritual, { wins: ["Shipped the portfolio", "Ran 5k"] });
    await actions.completeRitual(ritual, { wins: ["Shipped the portfolio!", "Ran 5k"] });
    const reviewWins = (await db.wins.toArray()).filter((w) => w.source === "cycle_review");
    expect(reviewWins.map((w) => w.title).sort()).toEqual(["Ran 5k", "Shipped the portfolio!"]);
    expect(await db.wins.get(ritualWinId(ritual, 0))).toMatchObject({ title: "Shipped the portfolio!" });

    const md = winsMarkdown(
      [
        {
          date: "2026-11-14",
          title: "Shipped",
          description: "Live site",
          impact: "3 interviews",
          links: ["https://x.dev"],
          areaId: null,
          goalId: goal,
        },
        { date: "2026-10-02", title: "Ran 5k", description: "", impact: "", links: [], areaId: null, goalId: null },
      ],
      { areas: new Map(), goals: new Map([[goal, "Land a role"]]) },
    );
    expect(md).toBe(
      "# Wins\n\n## November 2026\n\n- **Shipped** (2026-11-14) · Land a role\n  Live site\n  *Impact:* 3 interviews\n  https://x.dev\n## October 2026\n\n- **Ran 5k** (2026-10-02)\n",
    );
  });
});

describe("goal updates (GOAL-7)", () => {
  it("records status and health changes and notes", async () => {
    const { db, actions } = setup();
    const goal = await actions.createGoal({ title: "Run a half", status: "active" });
    await actions.updateGoal(goal, { health: "at_risk" });
    vi.setSystemTime(Date.now() + 1000);
    await actions.updateGoal(goal, { health: "at_risk" }); // no change, no event
    vi.setSystemTime(Date.now() + 1000);
    await actions.updateGoal(goal, { status: "paused" });
    vi.setSystemTime(Date.now() + 1000);
    await actions.addGoalUpdate(goal, " Knee is better, back to 3 runs a week ");
    vi.setSystemTime(Date.now() + 1000);
    await actions.completeGoal(goal);
    vi.setSystemTime(Date.now() + 1000);
    await actions.reopenGoal(goal);
    vi.setSystemTime(Date.now() + 1000);
    await actions.dropGoal(goal, "Moving cities");
    vi.setSystemTime(Date.now() + 1000);
    const events = (await db.goalEvents.where("goalId").equals(goal).toArray()).sort(
      (a, b) => a.at - b.at || a.createdAt - b.createdAt,
    );
    expect(events.map((e) => [e.type, e.from, e.to, e.text])).toEqual([
      ["health", null, "at_risk", null],
      ["status", "active", "paused", null],
      ["note", null, null, "Knee is better, back to 3 runs a week"],
      ["status", "paused", "completed", null],
      ["status", "completed", "active", null],
      ["status", "active", "dropped", "Moving cities"],
    ]);
  });
});

describe("cycle history (CYC-6) and habit consistency (HAB-4)", () => {
  it("adds up a cycle's points, focus hours and XP", () => {
    const cycle = {
      id: "c1",
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      committedTaskIds: ["a", "b"],
      committedPts: 5,
    };
    const t = (id: string, effort: 1 | 2 | 3, status: "done" | "todo") =>
      ({ ...newTaskFields({ title: id, effort, status, cycleId: "c1" }), id, deletedAt: null }) as never;
    const at = (d: string) => Date.parse(`${d}T10:00:00Z`);
    const stats = cycleStats(
      cycle,
      [t("a", 2, "done"), t("b", 3, "todo"), t("c", 1, "done")],
      [
        { startedAt: at("2026-11-02"), actualMinutes: 50, deletedAt: null },
        { startedAt: at("2026-11-03"), actualMinutes: 40, deletedAt: null },
        { startedAt: at("2026-11-20"), actualMinutes: 99, deletedAt: null },
      ],
      [
        { at: at("2026-11-05"), amount: 30, deletedAt: null },
        { at: at("2026-10-30"), amount: 500, deletedAt: null },
      ],
      "UTC",
    );
    expect(stats).toMatchObject({ points: { committed: 5, added: 1, done: 3, total: 6 }, focusHours: 1.5, xp: 30 });
    expect(stats.completion).toBe(0.5);
  });

  it("measures consistency over a window, and builds the heatmap", () => {
    const weekdays = {
      schedule: { type: "days" as const, days: [1, 2, 3, 4, 5] },
      targetType: "boolean" as const,
      targetCount: 1,
    };
    // 2026-11-14 is a Saturday. Mon–Fri this week: done Mon, Tue, Thu.
    const logs = ["2026-11-09", "2026-11-10", "2026-11-12"].map((date) => ({ date, value: 1 }));
    const opts = { weekStart: 1, startDay: "2026-11-09" };
    expect(consistency(weekdays, logs, "2026-11-14", 30, opts)).toBe(3 / 5);
    expect(consistency(weekdays, [], "2026-11-09", 30, opts)).toBeNull(); // today not done yet: nothing due
    const weekly = {
      schedule: { type: "weekly" as const, timesPerWeek: 2 },
      targetType: "boolean" as const,
      targetCount: 1,
    };
    // Week of 2 Nov: twice (met); week of 9 Nov: once so far (not over, not counted).
    const wl = ["2026-11-03", "2026-11-05", "2026-11-10"].map((date) => ({ date, value: 1 }));
    expect(consistency(weekly, wl, "2026-11-14", 30, { weekStart: 1, startDay: "2026-11-02" })).toBe(1);
    const grid = habitHeatmap(weekdays, logs, "2026-11-14", { weeks: 2, weekStart: 1 });
    expect(grid).toHaveLength(2);
    expect(grid[1][0]).toMatchObject({ day: "2026-11-09", level: 2, scheduled: true });
    expect(grid[1][2]).toMatchObject({ day: "2026-11-11", level: 0, scheduled: true });
    expect(grid[1][5]).toMatchObject({ day: "2026-11-14", scheduled: false, future: false });
    expect(grid[1][6]).toMatchObject({ day: "2026-11-15", future: true });
  });
});

describe("coach reflection tools", () => {
  it("reads the journal and wins, logs a win and posts a goal update, with undo", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    await actions.saveJournal("2026-11-13", { text: "Tired but sent 3 applications", mood: 3, energy: 2 });
    await actions.saveJournal("2026-10-01", { text: "Too old" });
    const goal = await actions.createGoal({ title: "Land a role", status: "active" });

    const out = await runCoachTool(
      "log_win",
      { title: "Got an interview", goalId: goal, impact: "First in 2 months" },
      deps,
    );
    expect(out.isError).toBeUndefined();
    const { id } = JSON.parse(out.content);
    expect(await db.wins.get(id)).toMatchObject({
      title: "Got an interview",
      goalId: goal,
      date: "2026-11-14",
      source: "coach",
    });
    await runCoachTool("add_goal_update", { goalId: goal, text: "Interview on Thursday" }, deps);
    expect((await db.goalEvents.where("goalId").equals(goal).toArray())[0]).toMatchObject({
      type: "note",
      text: "Interview on Thursday",
      actor: "ai",
    });

    const r = JSON.parse((await runCoachTool("get_reflection", { days: 7 }, deps)).content);
    expect(r).toMatchObject({
      from: "2026-11-08",
      journal: [{ date: "2026-11-13", mood: "3/5", energy: "2/5", text: "Tired but sent 3 applications" }],
      wins: [{ title: "Got an interview", impact: "First in 2 months" }],
    });

    const logged = (await db.aiActions.toArray()).find((a) => a.tool === "log_win")!;
    expect(logged.summary).toBe("Log a win: “Got an interview”");
    await undoAction(engine, logged.id);
    expect((await db.wins.get(id))?.deletedAt).toBeTypeOf("number");
  });
});
