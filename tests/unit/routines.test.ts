import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { runCoachTool } from "@/features/coach/device";
import { monthGrid, searchJournal } from "@/features/journal/model";
import { dueNotifications } from "@/features/reminders/model";
import { newStepId, routineDueOn, routineRunId, runProgress } from "@/features/routines/model";
import { blockedIds, blocking, newlyUnblocked, openBlockers, wouldLoop } from "@/features/tasks/links";
import { newTaskFields, type Task } from "@/features/tasks/model";
import { totalXp } from "@/features/xp/model";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

const USER = "user0000000001";
const NOW = Date.UTC(2026, 10, 16, 7); // Monday 16 November, 07:00 UTC

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function setup() {
  const db = openLocalDb(`rt-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
  const actions = createActions(engine, USER);
  return { db, engine, actions, deps: { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } } };
}

const steps = [
  { id: "s1", text: "Glass of water", minutes: null, habitId: null },
  { id: "s2", text: "Stretch", minutes: 5, habitId: null },
  { id: "s3", text: "Plan the day", minutes: 10, habitId: null },
];

describe("routines (HAB-5)", () => {
  it("ids, days and progress", () => {
    expect(routineRunId("routine000001", "2026-11-16")).toBe("rr20261116routine000001");
    expect(newStepId([{ id: "s1" }, { id: "s3" }])).toBe("s4");
    expect(newStepId([{ id: "s2" }])).toBe("s3");
    expect(routineDueOn({ days: [], archivedAt: null }, "2026-11-16")).toBe(true);
    expect(routineDueOn({ days: [1, 3, 5], archivedAt: null }, "2026-11-16")).toBe(true); // Monday
    expect(routineDueOn({ days: [0, 6], archivedAt: null }, "2026-11-16")).toBe(false);
    expect(routineDueOn({ days: [], archivedAt: 1 }, "2026-11-16")).toBe(false);
    const r = { steps };
    expect(runProgress(r, undefined)).toMatchObject({
      done: 0,
      total: 3,
      next: steps[0],
      complete: false,
      minutesLeft: 15,
    });
    const run = { doneStepIds: ["s1"], skippedStepIds: ["s2"], completedAt: null };
    expect(runProgress(r, run)).toMatchObject({ done: 1, next: steps[2], complete: false, minutesLeft: 10 });
    expect(runProgress(r, { ...run, doneStepIds: ["s1", "s3"] }).complete).toBe(true);
  });

  it("running one: a habit step logs the habit; the last step finishes it with XP; undo reopens", async () => {
    const { db, actions } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const habitId = await actions.createHabit({ name: "Stretch" });
    const id = await actions.createRoutine({
      name: "Morning start",
      steps: steps.map((s) => (s.id === "s2" ? { ...s, habitId } : s)),
    });
    const routine = (await db.routines.get(id))!;
    const day = "2026-11-16";
    await actions.finishRoutineStep(routine, day, "s1");
    await actions.finishRoutineStep(routine, day, "s2");
    expect((await db.habitLogs.toArray()).map((l) => [l.habitId, l.date, l.value])).toEqual([[habitId, day, 1]]);
    const runId = routineRunId(id, day);
    expect(await db.routineRuns.get(runId)).toMatchObject({ doneStepIds: ["s1", "s2"], completedAt: null });
    const before = totalXp(await db.xpEvents.toArray());
    await actions.finishRoutineStep(routine, day, "s3", "skipped");
    expect((await db.routineRuns.get(runId))!.completedAt).toBe(NOW);
    expect(totalXp(await db.xpEvents.toArray()) - before).toBe(10);
    // Finishing again doesn't award twice; undoing a step reopens the run and takes the XP back.
    await actions.finishRoutineStep(routine, day, "s3");
    expect(totalXp(await db.xpEvents.toArray()) - before).toBe(10);
    await actions.undoRoutineStep(routine, day, "s1");
    expect(await db.routineRuns.get(runId)).toMatchObject({ completedAt: null, doneStepIds: ["s2", "s3"] });
    expect(totalXp(await db.xpEvents.toArray()) - before).toBe(0);
  });

  it("are reminded at their time on their days, unless finished", () => {
    const at = (t: string) => Date.parse(`2026-11-16T${t}:00Z`);
    const routine = {
      id: "routine000001",
      name: "Morning start",
      steps,
      days: [1],
      reminderTime: "07:15",
      archivedAt: null,
    };
    const base = {
      settings: { timezone: "UTC" },
      rituals: [],
      cycles: [],
      habits: [],
      habitLogs: [],
      reminders: [],
      dueTodayCount: 0,
      sent: new Set<string>(),
      routines: [routine],
    };
    const keys = (now: number, extra: Record<string, unknown> = {}) =>
      dueNotifications({ ...base, now, ...extra })
        .filter((n) => n.key.startsWith("routine:"))
        .map((n) => [n.key, n.body]);
    expect(keys(at("07:16"))).toEqual([["routine:routine000001:2026-11-16", "3 steps, about 15 min."]]);
    expect(keys(at("07:10"))).toEqual([]);
    expect(keys(at("07:16"), { routines: [{ ...routine, days: [2] }] })).toEqual([]);
    const run = {
      routineId: routine.id,
      date: "2026-11-16",
      doneStepIds: ["s1"],
      skippedStepIds: [],
      completedAt: null,
    };
    expect(keys(at("07:16"), { routineRuns: [run] })).toEqual([["routine:routine000001:2026-11-16", "2 steps to go."]]);
    expect(keys(at("07:16"), { routineRuns: [{ ...run, completedAt: 1 }] })).toEqual([]);
  });
});

describe("task links (TASK-8)", () => {
  const meta = { createdAt: 0, updatedAt: 0, deletedAt: null, serverVersion: 0 };
  const t = (id: string, p: Partial<Task> = {}) =>
    ({ ...newTaskFields({ title: id, status: "todo" }), id, ...meta, ...p }) as Task;

  it("blocked state, reverse lookup, loops and what finishing frees", () => {
    const tasks = [
      t("design"),
      t("build", { blockedBy: ["design"] }),
      t("ship", { blockedBy: ["build", "copy"] }),
      t("copy", { status: "done" }),
    ];
    expect([...blockedIds(tasks)].sort()).toEqual(["build", "ship"]);
    expect(openBlockers(tasks[2], new Map(tasks.map((x) => [x.id, x]))).map((x) => x.id)).toEqual(["build"]);
    expect(blocking("build", tasks).map((x) => x.id)).toEqual(["ship"]);
    expect(wouldLoop("design", "ship", tasks)).toBe(true); // ship waits on build, which waits on design
    expect(wouldLoop("design", "design", tasks)).toBe(true);
    expect(wouldLoop("ship", "design", tasks)).toBe(false);
    const done = tasks.map((x) => (x.id === "design" ? { ...x, status: "done" as const } : x));
    expect(newlyUnblocked("design", done).map((x) => x.id)).toEqual(["build"]);
    expect(newlyUnblocked("build", done)).toEqual([]); // ship still waits on build itself
  });

  it("adding a blocker refuses loops; finishing announces what it freed", async () => {
    const { db, actions } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const a = await actions.createTask({ title: "Write the brief", status: "todo" });
    const b = await actions.createTask({ title: "Send to the designer", status: "todo" });
    await actions.addBlocker((await db.tasks.get(b))! as Task, a);
    await expect(actions.addBlocker((await db.tasks.get(a))! as Task, b)).rejects.toThrow(/wait on each other/);
    const heard: string[][] = [];
    // The test runs without a browser: give it a window to send the event on.
    const g = globalThis as { window?: EventTarget };
    const had = g.window;
    g.window = new EventTarget();
    g.window.addEventListener("orbit:unblocked", (e) =>
      heard.push((e as CustomEvent<{ titles: string[] }>).detail.titles),
    );
    try {
      await actions.setTaskDone((await db.tasks.get(a))! as Task, true);
    } finally {
      g.window = had;
    }
    expect(heard).toEqual([["Send to the designer"]]);
    await actions.removeBlocker((await db.tasks.get(b))! as Task, a);
    expect((await db.tasks.get(b))!.blockedBy).toEqual([]);
  });
});

describe("journal search and calendar (JRN-3)", () => {
  const entries = [
    { date: "2026-11-10", text: "Interview at Acme went well. They loved the café case study.", mood: 4, energy: 3 },
    { date: "2026-11-12", text: "Tired. Skipped the gym.", mood: 2, energy: 1 },
    { date: "2026-11-14", text: "", mood: 3, energy: null },
    { date: "2026-11-15", text: "", mood: null, energy: null }, // empty: never listed
  ];
  it("finds words (accent-insensitive), filters by mood, newest first", () => {
    expect(searchJournal(entries, "").map((h) => h.date)).toEqual(["2026-11-14", "2026-11-12", "2026-11-10"]);
    expect(searchJournal(entries, "cafe acme").map((h) => h.date)).toEqual(["2026-11-10"]);
    expect(searchJournal(entries, "", 2).map((h) => h.date)).toEqual(["2026-11-12"]);
    expect(searchJournal(entries, "gym", 4)).toEqual([]);
    const long = [{ date: "2026-11-01", text: `${"x ".repeat(60)}needle and more`, mood: null, energy: null }];
    expect(searchJournal(long, "needle")[0].snippet).toMatch(/^….*needle and more$/);
  });

  it("lays out a month from the week start", () => {
    // November 2026 starts on a Sunday and has 30 days.
    const sun = monthGrid("2026-11", 0);
    expect(sun[0][0]).toBe("2026-11-01");
    expect(sun.at(-1)!.filter(Boolean).at(-1)).toBe("2026-11-30");
    const mon = monthGrid("2026-11", 1);
    expect(mon[0].slice(0, 7)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(mon.every((w) => w.length === 7)).toBe(true);
  });
});

describe("coach: routines and links", () => {
  it("sets up a routine and links tasks, refusing loops", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const out = await runCoachTool(
      "create_routine",
      {
        name: "Wind down",
        kind: "evening",
        steps: [{ text: "Phone away" }, { text: "Read", minutes: 20 }],
        reminderTime: "21:30",
      },
      deps,
    );
    const { id } = JSON.parse(out.content);
    expect(await db.routines.get(id)).toMatchObject({
      name: "Wind down",
      kind: "evening",
      reminderTime: "21:30",
      steps: [
        { id: "s1", text: "Phone away", minutes: null },
        { id: "s2", text: "Read", minutes: 20 },
      ],
    });
    const a = await actions.createTask({ title: "A", status: "todo" });
    const b = await actions.createTask({ title: "B", status: "todo" });
    expect((await runCoachTool("update_task", { id: b, blockedBy: [a] }, deps)).isError).toBeUndefined();
    expect((await db.tasks.get(b))!.blockedBy).toEqual([a]);
    expect((await runCoachTool("update_task", { id: a, blockedBy: [b] }, deps)).isError).toBe(true);
  });
});
