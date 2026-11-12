import "fake-indexeddb/auto";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import {
  elapsedMs,
  isTimeUp,
  MAX_SESSION_MINUTES,
  parseFocusState,
  pause,
  plannedMinutes,
  keepGoing,
  remainingMs,
  startFocus,
  workedMinutes,
} from "@/features/focus/model";
import { nextInstanceId, type Task, type TaskFields } from "@/features/tasks/model";
import { buildToday, buildUpcoming, isStale, overdueDays, staleReason, type SkipReason } from "@/features/today/model";
import { today as todayIn, type Day } from "@/lib/dates";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";
import { entitySchemas, type Recurrence } from "@/lib/sync/entities";
import { pushRequestSchema } from "@/lib/sync/protocol";
import { applyMutations, pullChanges } from "@/lib/sync/server";

/**
 * A simulated week on Today (Phase 1B exit criterion): the real actions run against a real local
 * database while the clock moves from day to day, and the Today sections are checked each day.
 * Monday 16 November 2026 to Sunday 22 November 2026.
 */

const MON = "2026-11-16";
const TUE = "2026-11-17";
const WED = "2026-11-18";
const THU = "2026-11-19";
const FRI = "2026-11-20";
const SAT = "2026-11-21";
const SUN = "2026-11-22";
const NEXT_MON = "2026-11-23";
const USER = "user0000000001";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Only the date is faked: IndexedDB and MongoDB need real timers. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Sets the clock to a wall-clock time in UTC. */
function goto(day: Day, time = "09:00") {
  vi.setSystemTime(Date.parse(`${day}T${time}:00Z`));
}
const tick = (ms = MIN) => vi.setSystemTime(Date.now() + ms);

let worlds = 0;
const offline = (() => new Promise<Response>(() => {})) as typeof fetch;

/** One user on one device: a local database, the app's actions, and readers that return task titles. */
async function world(timezone = "UTC", fetchImpl: typeof fetch = offline) {
  const db = openLocalDb(`week-${++worlds}-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, fetchImpl);
  const actions = createActions(engine, USER);
  await actions.saveSettings({ timezone, dailyCapacityPts: 8 });

  const day = () => todayIn(timezone);
  const get = async (id: string) => (await db.tasks.get(id))!;
  const all = () => db.tasks.toArray();
  const titles = (list: Task[]) => list.map((t) => t.title);
  const w = {
    db,
    engine,
    actions,
    day,
    get,
    all,
    async add(title: string, fields: Partial<TaskFields> = {}) {
      const id = await actions.createTask({ title, status: "todo", ...fields });
      tick();
      return id;
    },
    async rawPlan() {
      return buildToday(await all(), { today: day(), now: Date.now(), timezone, capacity: 8 });
    },
    /** Today's sections as task titles. */
    async plan() {
      const p = await w.rawPlan();
      return {
        stale: titles(p.stale),
        mustDos: titles(p.mustDos),
        also: titles(p.also),
        overdue: titles(p.overdue),
        doneToday: titles(p.doneToday),
      };
    },
    async capacity() {
      return (await w.rawPlan()).capacity;
    },
    async upcoming() {
      return buildUpcoming(await all(), day()).map((g) => [g.day, ...titles(g.tasks)]);
    },
    async star(id: string, on = true) {
      await actions.setMustDo(await get(id), day(), on);
      tick();
    },
    async done(id: string, done = true) {
      await actions.setTaskDone(await get(id), done);
      tick();
    },
    async skip(id: string, reason: SkipReason | null, to: Day | null) {
      await actions.skipTask(await get(id), { reason, to, todayDay: day() });
      tick();
    },
    async planToday(id: string) {
      await actions.planForToday(await get(id), day());
      tick();
    },
    async events(id: string, type: string) {
      const rows = await db.taskEvents.where("taskId").equals(id).toArray();
      return rows.filter((e) => e.type === type).sort((a, b) => a.at - b.at);
    },
  };
  return w;
}

describe("a week on Today", () => {
  it("runs Monday to Sunday: Must-dos, skips, overdue, stale, done and capacity each day", async () => {
    // ------------------------------------------------------------ Monday
    goto(MON);
    const w = await world();
    const a = await w.add("Write report", { scheduledDate: MON, effort: 3 });
    const b = await w.add("Call bank", { scheduledDate: MON, effort: 2 });
    const c = await w.add("Gym", { scheduledDate: MON, effort: 1 });
    const d = await w.add("Taxes", { scheduledDate: MON, effort: 5 });
    const e = await w.add("Book dentist", { scheduledDate: WED, effort: 1 });
    const f = await w.add("Renew passport", { dueDate: FRI, effort: 2 });
    for (const id of [a, b, c]) await w.star(id);

    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: ["Write report", "Call bank", "Gym"],
      also: ["Taxes"],
      overdue: [],
      doneToday: [],
    });
    expect(await w.capacity()).toEqual({ planned: 11, done: 0, capacity: 8, unestimated: 0, over: 3 });
    expect(await w.upcoming()).toEqual([
      [WED, "Book dentist"],
      [FRI, "Renew passport"],
    ]);

    // A 4th Must-do that slips past the UI (say, starred on another device) never shows as a 4th.
    await w.star(d);
    expect((await w.plan()).mustDos).toEqual(["Write report", "Call bank", "Gym"]);
    expect((await w.plan()).also).toEqual(["Taxes"]);
    await w.star(d, false);
    // The UI's answer to a 4th is a swap.
    await w.actions.swapMustDo(await w.get(c), await w.get(d), w.day());
    expect((await w.plan()).mustDos).toEqual(["Write report", "Call bank", "Taxes"]);
    expect((await w.plan()).also).toEqual(["Gym"]);

    goto(MON, "10:00");
    await w.done(a);
    // A finished Must-do stays in its slot for the day.
    expect((await w.plan()).mustDos).toEqual(["Write report", "Call bank", "Taxes"]);
    expect((await w.plan()).doneToday).toEqual([]);
    expect(await w.capacity()).toMatchObject({ planned: 11, done: 3, over: 3 });

    goto(MON, "17:00");
    await w.skip(c, "no_time", TUE);
    expect(await w.get(c)).toMatchObject({ scheduledDate: TUE, postponeCount: 1 });
    expect((await w.plan()).also).toEqual([]);
    expect(await w.capacity()).toMatchObject({ planned: 10, done: 3, over: 2 });
    expect(await w.upcoming()).toEqual([
      [TUE, "Gym"],
      [WED, "Book dentist"],
      [FRI, "Renew passport"],
    ]);

    // ------------------------------------------------------------ Tuesday
    goto(TUE, "08:00");
    // Yesterday's unfinished Must-dos are not Must-dos today: they are overdue and need a decision.
    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: [],
      also: ["Gym"],
      overdue: ["Call bank", "Taxes"],
      doneToday: [],
    });
    expect(overdueDays(await w.get(b), TUE)).toBe(1);
    expect(await w.capacity()).toEqual({ planned: 1, done: 0, capacity: 8, unestimated: 0, over: 0 });

    // "Today" on an overdue task: back on today's list, and not a skip.
    await w.planToday(b);
    expect((await w.plan()).also).toEqual(["Call bank", "Gym"]);
    expect((await w.plan()).overdue).toEqual(["Taxes"]);
    expect((await w.get(b)).postponeCount).toBe(0);
    expect(await w.events(b, "skip")).toHaveLength(0);
    expect((await w.events(b, "reschedule")).map((x) => [x.from, x.to])).toEqual([[MON, TUE]]);

    // Starring it again works, for today.
    await w.star(b);
    expect((await w.plan()).mustDos).toEqual(["Call bank"]);
    expect((await w.get(b)).mustDoDate).toBe(TUE);

    // Moving an overdue task forward is a skip.
    await w.skip(d, "too_big", THU);
    expect(await w.get(d)).toMatchObject({ scheduledDate: THU, postponeCount: 1, mustDoDate: null });
    expect((await w.plan()).overdue).toEqual([]);

    await w.skip(c, "avoiding", WED);
    expect((await w.get(c)).postponeCount).toBe(2);

    goto(TUE, "15:00");
    await w.done(b);
    expect(await w.capacity()).toMatchObject({ planned: 2, done: 2 });

    // Moving a task that is still in the future is not a skip.
    await w.skip(e, null, THU);
    expect(await w.get(e)).toMatchObject({ scheduledDate: THU, postponeCount: 0 });
    expect(await w.events(e, "skip")).toHaveLength(0);
    expect((await w.events(e, "reschedule")).map((x) => [x.from, x.to])).toEqual([[WED, THU]]);

    // Pulling a task earlier is not a skip either.
    await w.planToday(f);
    expect(await w.get(f)).toMatchObject({ scheduledDate: TUE, dueDate: FRI, postponeCount: 0 });
    expect(await w.events(f, "skip")).toHaveLength(0);
    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: ["Call bank"],
      also: ["Renew passport"],
      overdue: [],
      doneToday: [],
    });
    expect(await w.capacity()).toMatchObject({ planned: 4, done: 2, over: 0 });
    expect(await w.upcoming()).toEqual([
      [WED, "Gym"],
      [THU, "Taxes", "Book dentist"],
    ]);

    // ------------------------------------------------------------ Wednesday
    goto(WED, "08:00");
    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: [],
      also: ["Gym"],
      overdue: ["Renew passport"],
      doneToday: [],
    });
    expect(overdueDays(await w.get(f), WED)).toBe(1);

    // Third move on a third day: stale, pinned, and not repeated anywhere else on Today.
    await w.skip(c, "low_energy", THU);
    expect((await w.get(c)).postponeCount).toBe(3);
    expect(await w.plan()).toEqual({
      stale: ["Gym"],
      mustDos: [],
      also: [],
      overdue: ["Renew passport"],
      doneToday: [],
    });
    expect(staleReason(await w.get(c), Date.now())).toBe("Postponed 3×");
    expect((await w.events(c, "skip")).map((x) => [x.reason, x.from, x.to])).toEqual([
      ["no_time", MON, TUE],
      ["avoiding", TUE, WED],
      ["low_energy", WED, THU],
    ]);
    expect(await w.capacity()).toMatchObject({ planned: 0, done: 0 });
    expect(await w.upcoming()).toEqual([[THU, "Gym", "Taxes", "Book dentist"]]);

    // ------------------------------------------------------------ Thursday
    goto(THU, "08:00");
    expect(await w.plan()).toEqual({
      stale: ["Gym"],
      mustDos: [],
      also: ["Taxes", "Book dentist"],
      overdue: ["Renew passport"],
      doneToday: [],
    });
    expect(overdueDays(await w.get(f), THU)).toBe(2);
    // The stale task waits for a decision; it is not counted in today's plan.
    expect(await w.capacity()).toMatchObject({ planned: 6, done: 0 });

    await w.actions.resolveStale(await w.get(c), "commit", { to: FRI });
    expect(await w.get(c)).toMatchObject({ scheduledDate: FRI, postponeCount: 0 });
    expect((await w.plan()).stale).toEqual([]);
    expect((await w.events(c, "edit")).map((x) => [x.reason, x.to])).toEqual([["stale_commit", FRI]]);

    goto(THU, "10:00");
    await w.done(d);
    goto(THU, "11:00");
    await w.done(e);
    expect((await w.plan()).doneToday).toEqual(["Book dentist", "Taxes"]);
    expect(await w.capacity()).toMatchObject({ planned: 6, done: 6 });

    goto(THU, "23:30");
    await w.planToday(f);
    await w.done(f);
    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: [],
      also: [],
      overdue: [],
      doneToday: ["Renew passport", "Book dentist", "Taxes"],
    });
    expect(await w.capacity()).toEqual({ planned: 8, done: 8, capacity: 8, unestimated: 0, over: 0 });
    expect(await w.upcoming()).toEqual([[FRI, "Gym"]]);

    // ------------------------------------------------------------ Friday, just after midnight
    goto(FRI, "00:05");
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: ["Gym"], overdue: [], doneToday: [] });
    expect(await w.capacity()).toEqual({ planned: 1, done: 0, capacity: 8, unestimated: 0, over: 0 });
    goto(FRI, "09:00");
    await w.done(c);
    expect((await w.plan()).doneToday).toEqual(["Gym"]);

    // ------------------------------------------------------------ Saturday: nothing planned
    goto(SAT);
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: [], overdue: [], doneToday: [] });
    expect(await w.capacity()).toEqual({ planned: 0, done: 0, capacity: 8, unestimated: 0, over: 0 });
    expect(await w.upcoming()).toEqual([]);

    // ------------------------------------------------------------ Sunday
    goto(SUN);
    const g = await w.add("Plan next week", { scheduledDate: SUN, effort: 8 });
    await w.add("Water plants", { scheduledDate: SUN });
    await w.star(g);
    expect(await w.plan()).toMatchObject({ mustDos: ["Plan next week"], also: ["Water plants"] });
    expect(await w.capacity()).toEqual({ planned: 8, done: 0, capacity: 8, unestimated: 1, over: 0 });
    await w.done(g);
    expect(await w.capacity()).toMatchObject({ planned: 8, done: 8, unestimated: 1 });

    // The week's record: four skips, each with a reason.
    const skips = (await w.db.taskEvents.toArray()).filter((x) => x.type === "skip");
    expect(skips).toHaveLength(4);
    expect(skips.every((x) => x.reason)).toBe(true);
  });

  it("holds the cap of 3 Must-dos on each day separately", async () => {
    goto(MON);
    const w = await world();
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) ids.push(await w.add(`Task ${i}`, { scheduledDate: MON }));
    for (const id of ids) await w.star(id);
    expect((await w.plan()).mustDos).toHaveLength(3);

    goto(TUE);
    expect((await w.plan()).mustDos).toEqual([]);
    expect((await w.plan()).overdue).toHaveLength(4);
    for (const id of ids) await w.star(id);
    expect((await w.plan()).mustDos).toEqual(["Task 1", "Task 2", "Task 3"]);
    expect((await w.plan()).also).toEqual(["Task 4"]);
    expect((await w.plan()).overdue).toEqual([]);
  });
});

describe("stale tasks across days", () => {
  /** Moves one task forward on Monday, Tuesday and Wednesday; it is stale on Wednesday, planned for Thursday. */
  async function staleByWednesday() {
    goto(MON);
    const w = await world();
    const id = await w.add("Tidy the garage", { scheduledDate: MON });
    await w.skip(id, "no_time", TUE);
    goto(TUE);
    await w.skip(id, "avoiding", WED);
    goto(WED);
    await w.skip(id, "too_big", THU);
    expect((await w.plan()).stale).toEqual(["Tidy the garage"]);
    return { w, id };
  }

  it("break it down: count reset, subtasks added, back in the normal list on its day", async () => {
    const { w, id } = await staleByWednesday();
    await w.actions.resolveStale(await w.get(id), "break_down", { subtasks: ["Sort the shelves", " ", "Bin run"] });
    expect((await w.get(id)).postponeCount).toBe(0);
    const subs = (await w.all()).filter((t) => t.parentTaskId === id);
    expect(subs.map((t) => t.title).sort()).toEqual(["Bin run", "Sort the shelves"]);
    expect((await w.plan()).stale).toEqual([]);
    expect((await w.events(id, "edit")).map((x) => x.reason)).toEqual(["stale_break_down"]);
    goto(THU);
    // Subtasks are never rows of their own on Today.
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: ["Tidy the garage"], overdue: [], doneToday: [] });
  });

  it("do 5 minutes now: count reset and in progress", async () => {
    const { w, id } = await staleByWednesday();
    await w.actions.resolveStale(await w.get(id), "five_minutes");
    await w.actions.startFocusSession(await w.get(id), "five", 5, Date.now());
    expect(await w.get(id)).toMatchObject({ postponeCount: 0, status: "in_progress", scheduledDate: THU });
    expect((await w.plan()).stale).toEqual([]);
    goto(THU);
    expect((await w.plan()).also).toEqual(["Tidy the garage"]);
  });

  it("reschedule with a commitment: moves to the chosen day", async () => {
    const { w, id } = await staleByWednesday();
    await w.actions.resolveStale(await w.get(id), "commit", { to: SAT });
    expect(await w.get(id)).toMatchObject({ postponeCount: 0, scheduledDate: SAT });
    expect((await w.plan()).stale).toEqual([]);
    expect(await w.upcoming()).toEqual([[SAT, "Tidy the garage"]]);
    // Moving it again after committing starts a new count.
    goto(SAT);
    await w.skip(id, "no_time", SUN);
    expect((await w.get(id)).postponeCount).toBe(1);
    expect((await w.plan()).stale).toEqual([]);
  });

  it("ask for help: the note is kept on the task", async () => {
    const { w, id } = await staleByWednesday();
    await w.actions.resolveStale(await w.get(id), "help", { note: " Ask Sam for the van " });
    expect(await w.get(id)).toMatchObject({ postponeCount: 0, description: "Help: Ask Sam for the van" });
    expect((await w.events(id, "edit")).map((x) => [x.reason, x.reasonText])).toEqual([
      ["stale_help", "Ask Sam for the van"],
    ]);
    expect((await w.plan()).stale).toEqual([]);
  });

  it("drop it: cancelled and gone from Today and Upcoming", async () => {
    const { w, id } = await staleByWednesday();
    await w.actions.resolveStale(await w.get(id), "drop");
    const t = await w.get(id);
    expect(t).toMatchObject({ status: "cancelled", postponeCount: 0 });
    expect(t.cancelledAt).toBe(Date.parse(`${WED}T09:00:00Z`) + MIN);
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: [], overdue: [], doneToday: [] });
    expect(await w.upcoming()).toEqual([]);
    goto(THU);
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: [], overdue: [], doneToday: [] });
  });

  it("untouched for 14 days: flagged on day 15, and any change clears it", async () => {
    goto(MON);
    const w = await world();
    const left = await w.add("Fix the tap", { scheduledDate: MON });
    const started = await w.add("Read the book", { status: "in_progress" });
    const nudged = await w.add("Sort photos", { scheduledDate: MON });

    goto("2026-11-26"); // day 11
    await w.actions.setTaskOrder(await w.get(nudged), 5);

    goto("2026-11-29", "23:00"); // day 14
    expect((await w.plan()).stale).toEqual([]);
    expect((await w.plan()).overdue).toEqual(["Sort photos", "Fix the tap"]);
    expect(overdueDays(await w.get(left), w.day())).toBe(13);

    goto("2026-11-30", "09:05"); // day 15: 14 full days
    expect((await w.plan()).stale).toEqual(["Fix the tap", "Read the book"]);
    expect((await w.plan()).overdue).toEqual(["Sort photos"]);
    expect((await w.plan()).also).toEqual([]);
    expect(staleReason(await w.get(left), Date.now())).toBe("Untouched for 14 days");

    await w.actions.resolveStale(await w.get(left), "help", { note: "Call a plumber" });
    await w.actions.updateTask(await w.get(started), { nextStep: "Chapter 3" });
    expect((await w.plan()).stale).toEqual([]);
    expect((await w.plan()).overdue).toEqual(["Sort photos", "Fix the tap"]);
    expect((await w.plan()).also).toEqual(["Read the book"]);
  });

  it("a task planned two weeks ahead is not stale on the day it comes up", async () => {
    goto(MON);
    const w = await world();
    const id = await w.add("Renew insurance", { scheduledDate: "2026-11-30" });
    await w.add("File expenses", { dueDate: "2026-12-02" });

    goto("2026-11-30", "07:00");
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: ["Renew insurance"], overdue: [], doneToday: [] });
    goto("2026-12-02", "07:00");
    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: [],
      also: ["File expenses"],
      overdue: ["Renew insurance"],
      doneToday: [],
    });
    // It has to sit on the plan untouched for 14 days.
    goto("2026-12-13", "23:00");
    expect(isStale(await w.get(id), w.day(), Date.now())).toBe(false);
    goto("2026-12-14", "07:00");
    expect(isStale(await w.get(id), w.day(), Date.now())).toBe(true);
  });
});

describe("recurring tasks across days", () => {
  const daily: Recurrence = { freq: "daily", interval: 1, mode: "fixed" };
  const weekdays: Recurrence = { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5], mode: "fixed" };
  const open = async (w: Awaited<ReturnType<typeof world>>, title: string) =>
    (await w.all()).filter((t) => t.title === title && t.status !== "done" && t.deletedAt == null);
  const count = async (w: Awaited<ReturnType<typeof world>>, title: string) =>
    (await w.all()).filter((t) => t.title === title).length;

  it("daily: each completion creates the next day's task once, also after undo and redo", async () => {
    goto(MON);
    const w = await world();
    const root = await w.add("Stretch", { dueDate: MON, recurrence: daily });
    await w.done(root);
    await w.done(root, false);
    await w.done(root);
    expect(await count(w, "Stretch")).toBe(2);
    const [tue] = await open(w, "Stretch");
    expect(tue).toMatchObject({
      id: nextInstanceId(root, TUE),
      dueDate: TUE,
      scheduledDate: null,
      status: "todo",
      completedAt: null,
      recurrenceParentId: root,
    });
    expect(await w.plan()).toMatchObject({ also: [], doneToday: ["Stretch"] });
    expect(await w.upcoming()).toEqual([[TUE, "Stretch"]]);

    goto(TUE);
    expect(await w.plan()).toMatchObject({ also: ["Stretch"], doneToday: [] });
    await w.done(tue.id);
    expect(await count(w, "Stretch")).toBe(3);
    expect((await open(w, "Stretch")).map((t) => [t.dueDate, t.recurrenceParentId])).toEqual([[WED, root]]);
  });

  it("daily, completed two days late: one next task, due after the one just done", async () => {
    goto(MON);
    const w = await world();
    const root = await w.add("Stretch", { dueDate: MON, recurrence: daily });
    goto(WED);
    expect(await w.plan()).toMatchObject({ overdue: ["Stretch"], also: [] });
    expect(overdueDays(await w.get(root), WED)).toBe(2);
    await w.done(root);
    const next = await open(w, "Stretch");
    expect(next).toHaveLength(1);
    expect(next[0].dueDate! > MON).toBe(true);
    expect((await w.plan()).doneToday).toEqual(["Stretch"]);
  });

  it("weekdays: Friday's is followed by Monday's, whether done on Friday or on Saturday", async () => {
    goto(FRI);
    const w = await world();
    const onTime = await w.add("Stand-up notes", { dueDate: FRI, recurrence: weekdays });
    const late = await w.add("Inbox zero", { dueDate: FRI, recurrence: weekdays });
    await w.done(onTime);
    goto(SAT);
    await w.done(late);
    expect((await open(w, "Stand-up notes")).map((t) => t.dueDate)).toEqual([NEXT_MON]);
    expect((await open(w, "Inbox zero")).map((t) => t.dueDate)).toEqual([NEXT_MON]);
    goto(NEXT_MON);
    expect((await w.plan()).also).toEqual(["Stand-up notes", "Inbox zero"]);
  });

  it("weekly, done two days late: fixed keeps its weekday, after completion counts from the day done", async () => {
    goto(MON);
    const w = await world();
    const fixed = await w.add("Weekly review", {
      dueDate: MON,
      recurrence: { freq: "weekly", interval: 1, mode: "fixed" },
    });
    const after = await w.add("Clean the flat", {
      dueDate: MON,
      recurrence: { freq: "weekly", interval: 1, mode: "after_completion" },
    });
    goto(WED);
    await w.done(fixed);
    await w.done(after);
    expect((await open(w, "Weekly review")).map((t) => t.dueDate)).toEqual([NEXT_MON]);
    expect((await open(w, "Clean the flat")).map((t) => t.dueDate)).toEqual(["2026-11-25"]);
    expect(await count(w, "Weekly review")).toBe(2);
    expect(await count(w, "Clean the flat")).toBe(2);
  });

  it("the next task starts clean: not a Must-do, no postpone count", async () => {
    goto(MON);
    const w = await world();
    const must = await w.add("Stretch", { dueDate: MON, recurrence: daily });
    const moved = await w.add("Journal", { dueDate: MON, recurrence: daily });
    await w.star(must);
    await w.done(must);
    // Only the finished one holds a Must-do slot; tomorrow's is not on Today yet.
    expect(await w.plan()).toEqual({ stale: [], mustDos: ["Stretch"], also: ["Journal"], overdue: [], doneToday: [] });
    expect((await open(w, "Stretch"))[0]).toMatchObject({ dueDate: TUE, mustDoDate: null, postponeCount: 0 });

    await w.skip(moved, "no_time", TUE);
    goto(TUE);
    await w.skip(moved, "no_time", WED);
    goto(WED);
    await w.skip(moved, "no_time", THU);
    expect((await w.plan()).stale).toEqual(["Journal"]);
    await w.done(moved);
    const next = (await open(w, "Journal"))[0];
    expect(next).toMatchObject({ dueDate: TUE, postponeCount: 0, mustDoDate: null });
    expect((await w.plan()).stale).toEqual([]);
  });
});

describe("Done today follows the user's timezone", () => {
  it("ahead of UTC (Auckland, UTC+13): midnight is 11:00 UTC", async () => {
    vi.setSystemTime(Date.parse("2026-11-16T10:50:00Z")); // Monday 23:50 in Auckland
    const w = await world("Pacific/Auckland");
    expect(w.day()).toBe(MON);
    const late = await w.add("Late task", { scheduledDate: MON, effort: 2 });
    const early = await w.add("Early task", { scheduledDate: MON, effort: 3 });
    const habit = await w.add("Floss", {
      dueDate: MON,
      recurrence: { freq: "daily", interval: 1, mode: "after_completion" },
    });
    await w.done(late);
    expect((await w.plan()).doneToday).toEqual(["Late task"]);
    expect(await w.capacity()).toMatchObject({ planned: 5, done: 2 });

    vi.setSystemTime(Date.parse("2026-11-16T11:10:00Z")); // Tuesday 00:10 in Auckland, still Monday in UTC
    expect(w.day()).toBe(TUE);
    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: [],
      also: [],
      overdue: ["Early task", "Floss"],
      doneToday: [],
    });
    await w.done(early);
    expect((await w.plan()).doneToday).toEqual(["Early task"]);
    expect(await w.capacity()).toMatchObject({ planned: 3, done: 3 });

    // Completed on Tuesday local time, so the next one is due Wednesday.
    await w.done(habit);
    const next = (await w.all()).find((t) => t.title === "Floss" && t.status === "todo")!;
    expect(next.dueDate).toBe(WED);
  });

  it("behind UTC (Los Angeles, UTC-8): midnight is 08:00 UTC", async () => {
    vi.setSystemTime(Date.parse("2026-11-17T07:50:00Z")); // Monday 23:50 in Los Angeles, already Tuesday in UTC
    const w = await world("America/Los_Angeles");
    expect(w.day()).toBe(MON);
    const late = await w.add("Late task", { scheduledDate: MON });
    const habit = await w.add("Floss", {
      dueDate: MON,
      recurrence: { freq: "daily", interval: 1, mode: "after_completion" },
    });
    await w.done(late);
    await w.done(habit);
    expect((await w.plan()).doneToday).toEqual(["Floss", "Late task"]);
    expect((await w.all()).find((t) => t.title === "Floss" && t.status === "todo")!.dueDate).toBe(TUE);

    vi.setSystemTime(Date.parse("2026-11-17T08:10:00Z")); // Tuesday 00:10 in Los Angeles
    expect(w.day()).toBe(TUE);
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: ["Floss"], overdue: [], doneToday: [] });
  });
});

describe("focus sessions across midnight", () => {
  it("started before midnight, finished after: the task is done on the new day", async () => {
    goto(MON, "23:50");
    const w = await world();
    const id = await w.add("Draft the intro", { scheduledDate: MON, effort: 2 });
    goto(MON, "23:50");
    const startedAt = Date.now();
    const sessionId = await w.actions.startFocusSession(await w.get(id), "pomodoro", 25, startedAt);
    let state = startFocus(sessionId, id, "pomodoro", 25, startedAt);
    expect((await w.get(id)).status).toBe("in_progress");
    expect((await w.plan()).also).toEqual(["Draft the intro"]);

    goto(TUE, "00:10");
    // The timer is derived from timestamps, so it carries on across midnight and a reload.
    state = parseFocusState(JSON.stringify(state))!;
    expect(elapsedMs(state, Date.now())).toBe(20 * MIN);
    expect(remainingMs(state, Date.now())).toBe(5 * MIN);
    expect(await w.plan()).toMatchObject({ also: [], overdue: ["Draft the intro"] });

    goto(TUE, "00:15");
    expect(isTimeUp(state, Date.now())).toBe(true);
    await w.actions.endFocusSession(sessionId, {
      endedAt: Date.now(),
      actualMinutes: workedMinutes(state, Date.now()),
      outcome: "done",
      interruptions: state.interruptions,
      mode: state.mode,
      plannedMinutes: plannedMinutes(state),
    });
    await w.done(id);
    expect(await w.db.focusSessions.get(sessionId)).toMatchObject({
      startedAt,
      endedAt: startedAt + 25 * MIN,
      actualMinutes: 25,
      plannedMinutes: 25,
      outcome: "done",
    });
    expect(await w.plan()).toEqual({ stale: [], mustDos: [], also: [], overdue: [], doneToday: ["Draft the intro"] });
    expect(await w.capacity()).toMatchObject({ planned: 2, done: 2 });
  });

  it("paused and left overnight: no work time is added, and the task is overdue in the morning", async () => {
    goto(MON, "22:00");
    const w = await world();
    const id = await w.add("Study", { scheduledDate: MON });
    goto(MON, "22:00");
    const sessionId = await w.actions.startFocusSession(await w.get(id), "open", null, Date.now());
    let state = startFocus(sessionId, id, "open", null, Date.now());
    goto(MON, "22:40");
    state = pause(state, Date.now());

    goto(TUE, "07:00");
    state = parseFocusState(JSON.stringify(state))!;
    expect(workedMinutes(state, Date.now())).toBe(40);
    expect(await w.plan()).toMatchObject({ also: [], overdue: ["Study"] });
  });

  it("left running over a weekend: the session can still be saved and synced", async () => {
    goto(FRI, "18:00");
    const w = await world();
    const id = await w.add("Study", { scheduledDate: FRI });
    goto(FRI, "18:00");
    const sessionId = await w.actions.startFocusSession(await w.get(id), "pomodoro", 25, Date.now());
    let state = startFocus(sessionId, id, "pomodoro", 25, Date.now());

    goto(NEXT_MON, "09:00");
    expect(isTimeUp(state, Date.now())).toBe(true);
    state = keepGoing(state, 25, Date.now());
    goto(NEXT_MON, "09:25");
    const end = {
      endedAt: Date.now(),
      actualMinutes: workedMinutes(state, Date.now()),
      outcome: "progress" as const,
      interruptions: state.interruptions,
      mode: state.mode,
      plannedMinutes: plannedMinutes(state),
    };
    expect(end.actualMinutes).toBe(MAX_SESSION_MINUTES);
    expect(end.plannedMinutes).toBe(MAX_SESSION_MINUTES);
    // The server rejects anything its schema doesn't accept, and a rejected write is dropped.
    expect(entitySchemas.focusSessions.partial().strict().safeParse(end).success).toBe(true);
  });
});

// ---------------------------------------------------------------- a device whose clock is ahead

let mongod: MongoMemoryServer;
let client: MongoClient;
let serverDb: Db;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
});
afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

/**
 * Routes the engine's fetch calls to the server functions, with the server on its own clock.
 * While `online` is false requests fail like a dropped connection.
 */
function serverWithClock(net: { online: boolean; serverNow: number }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!net.online) throw new TypeError("Failed to fetch");
    const deviceNow = Date.now();
    vi.setSystemTime(net.serverNow);
    try {
      const url = new URL(String(input), "http://x");
      if (url.pathname === "/api/sync/push") {
        const body = pushRequestSchema.parse(JSON.parse(String(init!.body)));
        return Response.json(await applyMutations(serverDb, USER, body.mutations));
      }
      return Response.json(await pullChanges(serverDb, USER, Number(url.searchParams.get("since"))));
    } finally {
      vi.setSystemTime(deviceNow);
    }
  }) as typeof fetch;
}

describe("a device clock ahead of the server", () => {
  beforeEach(() => {
    serverDb = client.db(`w${Math.random().toString(36).slice(2)}`);
  });

  it("three days ahead: Today is the same before and after syncing", async () => {
    // The server says Monday; the device believes it is Thursday.
    const net = { online: false, serverNow: Date.parse(`${MON}T09:00:00Z`) };
    goto(THU);
    const w = await world("UTC", serverWithClock(net));
    const a = await w.add("Write report", { scheduledDate: THU, effort: 3 });
    const b = await w.add("Call bank", { scheduledDate: THU, effort: 2 });
    const c = await w.add("Gym", { scheduledDate: THU, effort: 1 });
    await w.add("Taxes", { scheduledDate: WED, effort: 5 });
    await w.star(a);
    await w.star(b);
    await w.done(a);
    await w.skip(c, "no_time", FRI);
    const before = { plan: await w.plan(), capacity: await w.capacity(), upcoming: await w.upcoming() };
    expect(before.plan).toEqual({
      stale: [],
      mustDos: ["Write report", "Call bank"],
      also: [],
      overdue: ["Taxes"],
      doneToday: [],
    });

    const deviceNow = Date.now();
    net.online = true;
    await w.engine.sync();
    net.online = false;
    vi.setSystemTime(deviceNow);
    expect(w.engine.status).toMatchObject({ state: "idle", pending: 0 });
    // The pulled copies carry server time, three days behind this device.
    expect((await w.get(a)).updatedAt).toBe(net.serverNow);
    expect((await w.get(a)).completedAt).toBeGreaterThan(net.serverNow + 3 * DAY);
    expect({ plan: await w.plan(), capacity: await w.capacity(), upcoming: await w.upcoming() }).toEqual(before);

    // A later change on the same device still wins after another sync.
    await w.done(b);
    const afterDone = await w.plan();
    net.online = true;
    await w.engine.sync();
    net.online = false;
    vi.setSystemTime(deviceNow + 5 * MIN);
    expect(await w.plan()).toEqual(afterDone);
    expect((await w.get(b)).status).toBe("done");
  });

  it("more than 14 days ahead: syncing does not turn today's tasks stale", async () => {
    const net = { online: false, serverNow: Date.parse(`${MON}T09:00:00Z`) };
    goto("2026-12-03");
    const w = await world("UTC", serverWithClock(net));
    await w.add("Write report", { scheduledDate: "2026-12-03" });
    await w.add("Call bank", { scheduledDate: "2026-12-01" });
    const deviceNow = Date.now();
    net.online = true;
    await w.engine.sync();
    net.online = false;
    vi.setSystemTime(deviceNow);
    expect(await w.plan()).toEqual({
      stale: [],
      mustDos: [],
      also: ["Write report"],
      overdue: ["Call bank"],
      doneToday: [],
    });
  });
});
