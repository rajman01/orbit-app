import "fake-indexeddb/auto";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { habitConsistency, habitStatus, type Habit, type HabitLog } from "@/features/habits/model";
import { dueNotifications, inQuietHours } from "@/features/reminders/model";
import { accountabilityScore } from "@/features/report/model";
import { newTaskFields, type Task } from "@/features/tasks/model";
import {
  focusXp,
  goalXp,
  habitXp,
  levelFromXp,
  levelTitle,
  softCap,
  taskXp,
  totalXp,
  xpEventId,
  xpForLevel,
} from "@/features/xp/model";
import { addDays } from "@/lib/dates";
import { openLocalDb } from "@/lib/local-db/db";
import { dispatchReminders, type Sender } from "@/lib/push/server";
import { SyncEngine } from "@/lib/sync/engine";

vi.mock("server-only", () => ({}));

const T = "2026-11-12"; // a Thursday
const habit = (p: Partial<Habit>): Habit =>
  ({
    id: "habit00000001",
    name: "Read",
    areaId: null,
    goalId: null,
    schedule: { type: "daily" },
    targetType: "boolean",
    targetCount: 1,
    unit: null,
    reminderTime: null,
    archivedAt: null,
    order: 0,
    createdAt: Date.UTC(2026, 9, 1),
    updatedAt: 0,
    deletedAt: null,
    serverVersion: 0,
    ...p,
  }) as Habit;
const logs = (days: string[], value = 1): HabitLog[] =>
  days.map((date) => ({ id: date, habitId: "habit00000001", date, value, note: null }) as HabitLog);
const back = (n: number) => addDays(T, -n);
const opts = { weekStart: 0, startDay: "2026-10-01" };

describe("habits: never miss twice (HAB-3)", () => {
  it("counts a run of days, today included once it's done", () => {
    expect(habitStatus(habit({}), logs([back(1), back(2), back(3)]), T, opts)).toMatchObject({
      streak: 3,
      due: true,
      doneToday: false,
      atRisk: false,
    });
    expect(habitStatus(habit({}), logs([T, back(1), back(2)]), T, opts)).toMatchObject({ streak: 3, due: false });
  });

  it("one miss keeps the streak but puts it at risk; two in a row break it", () => {
    // Missed yesterday only.
    expect(habitStatus(habit({}), logs([back(2), back(3), back(4)]), T, opts)).toMatchObject({
      streak: 3,
      atRisk: true,
    });
    // A single miss further back doesn't break it either.
    expect(habitStatus(habit({}), logs([back(1), back(3), back(4)]), T, opts)).toMatchObject({
      streak: 3,
      atRisk: false,
    });
    // Two misses in a row: the older run doesn't count.
    expect(habitStatus(habit({}), logs([back(1), back(4), back(5)]), T, opts)).toMatchObject({ streak: 1 });
    expect(habitStatus(habit({}), logs([back(3), back(4)]), T, opts)).toMatchObject({ streak: 0, atRisk: false });
  });

  it("only scheduled days count for 'certain days' habits", () => {
    // Mon, Wed, Fri. Today is Thursday: not due; yesterday (Wed) and Monday done.
    const h = habit({ schedule: { type: "days", days: [1, 3, 5] } });
    expect(habitStatus(h, logs(["2026-11-11", "2026-11-09", "2026-11-06"]), T, opts)).toMatchObject({
      due: false,
      streak: 3,
      atRisk: false,
    });
  });

  it("counts targets and weekly habits by the week", () => {
    const counted = habit({ targetType: "count", targetCount: 20 });
    expect(habitStatus(counted, logs([T], 12), T, opts).doneToday).toBe(false);
    expect(habitStatus(counted, logs([T], 20), T, opts).doneToday).toBe(true);
    // 3× a week, weeks start Sunday. This week (from Sun 8 Nov): 2 so far. Last two weeks: met.
    const weekly = habit({ schedule: { type: "weekly", timesPerWeek: 3 } });
    const s = habitStatus(
      weekly,
      logs([
        "2026-11-09",
        "2026-11-10",
        "2026-11-02",
        "2026-11-04",
        "2026-11-05",
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
      ]),
      T,
      opts,
    );
    expect(s).toMatchObject({ unit: "week", streak: 2, due: true, thisWeek: { done: 2, target: 3 } });
  });

  it("measures consistency over a window, not counting today until it's done", () => {
    const rate = habitConsistency([habit({})], logs([back(1), back(2)]), back(3), T, {
      weekStart: 0,
      startDayOf: () => "2026-10-01",
    });
    expect(rate).toBeCloseTo(2 / 3);
  });
});

describe("XP rules (§9.1)", () => {
  const base = { effort: 3, mustDo: false, wasStale: false, createdAt: 0, completedAt: 10 * 60_000, recurring: false };
  it("10 × points, +50% for a Must-do, +100% for beating procrastination", () => {
    expect(taskXp(base).amount).toBe(30);
    expect(taskXp({ ...base, mustDo: true }).amount).toBe(45);
    expect(taskXp({ ...base, wasStale: true }).amount).toBe(60);
    expect(taskXp({ ...base, mustDo: true, wasStale: true }).amount).toBe(75);
    expect(taskXp({ ...base, effort: null }).amount).toBe(10);
  });
  it("anti-gaming: created and done within 2 minutes earns nothing, unless it repeats", () => {
    expect(taskXp({ ...base, completedAt: 60_000 }).amount).toBe(0);
    expect(taskXp({ ...base, completedAt: 60_000, recurring: true }).amount).toBe(30);
  });
  it("soft-caps a very big day at 3× the usual, never below 150", () => {
    expect(softCap(40, 0, 10)).toBe(40);
    expect(softCap(40, 150, 10)).toBe(20);
    expect(softCap(40, 130, 10)).toBe(30); // 20 within the cap + half of the other 20
    expect(softCap(40, 200, 100)).toBe(40); // cap is 300
  });
  it("focus, habits and goals", () => {
    expect(focusXp(24)).toBe(0);
    expect(focusXp(50)).toBe(30);
    expect(habitXp(0)).toBe(5);
    expect(habitXp(15)).toBe(8);
    expect(habitXp(60)).toBe(10);
    expect(goalXp("2026-01-01", "2026-04-01")).toBe(500);
    expect(goalXp("2026-01-01", "2026-01-08")).toBe(125);
    expect(goalXp("2026-01-01", "2027-01-01")).toBe(1000);
  });
  it("one id per source", () => {
    expect(xpEventId("task", "01ABC")).toBe(xpEventId("task", "01ABC"));
    expect(xpEventId("task", "01ABC")).not.toBe(xpEventId("focus", "01ABC"));
    expect(xpEventId("win", "0rp20261112abc")).toMatch(/^[0-9A-Za-z]{10,40}$/);
  });
});

describe("levels (§9.2)", () => {
  it("follows 100 × n^1.5 with space titles", () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(10)).toBe(3162);
    expect(levelFromXp(0)).toMatchObject({ level: 1, title: "Spark", into: 0, needed: 100, floor: 0 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100)).toMatchObject({ level: 2, title: "Drift", into: 0, floor: 100 });
    expect(levelFromXp(100 + 283)).toMatchObject({ level: 3, title: "Orbit" });
    expect(levelTitle(50)).toBe("Cosmos");
    expect(
      totalXp([
        { amount: 30, deletedAt: null },
        { amount: -5, deletedAt: null },
        { amount: 99, deletedAt: 1 },
      ]),
    ).toBe(25);
  });
});

describe("accountability score (§8.3)", () => {
  const task = (p: Partial<Task>) =>
    ({
      id: p.id ?? "t",
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      serverVersion: 0,
      ...newTaskFields({ title: "x" }),
      ...p,
    }) as Task;
  it("weights commitments, rituals, stale and habits, and leaves out what can't be measured", () => {
    const tasks = [
      task({ id: "a", status: "done", completedAt: Date.UTC(2026, 10, 10, 12) }),
      task({ id: "b", status: "todo" }),
    ];
    const rituals = [
      { type: "daily_plan" as const, date: "2026-11-10", completedAt: 1, data: { mustDos: ["a", "b"] } },
      { type: "daily_shutdown" as const, date: "2026-11-10", completedAt: 1, data: {} },
    ];
    const s = accountabilityScore({
      today: "2026-11-11",
      timezone: "UTC",
      weekStart: 0,
      firstDay: "2026-11-10",
      tasks,
      rituals,
      taskEvents: [{ reason: "stale_drop", at: Date.UTC(2026, 10, 10) }],
      staleNow: 1,
      habits: [],
      habitLogs: [],
    });
    expect(s.parts.commitment.value).toBe(0.5);
    expect(s.parts.rituals.value).toBe(1); // 2 of 2 for yesterday; today hasn't been done yet
    expect(s.parts.stale.value).toBe(0.5);
    expect(s.parts.habits.value).toBeNull();
    // (0.5×40 + 1×25 + 0.5×15) / 80
    expect(s.score).toBe(Math.round(((0.5 * 0.4 + 1 * 0.25 + 0.5 * 0.15) / 0.8) * 100));
  });
  it("has no score before anything happened", () => {
    const s = accountabilityScore({
      today: T,
      timezone: "UTC",
      weekStart: 0,
      firstDay: T,
      tasks: [],
      rituals: [],
      taskEvents: [],
      staleNow: 0,
      habits: [],
      habitLogs: [],
    });
    expect(s.score).toBeNull();
  });
});

describe("reminders (§12)", () => {
  const at = (time: string) => Date.parse(`${T}T${time}:00Z`);
  const base = {
    settings: { timezone: "UTC" },
    rituals: [],
    cycles: [],
    habits: [],
    habitLogs: [],
    reminders: [],
    dueTodayCount: 0,
    sent: new Set<string>(),
  };
  it("knows quiet hours across midnight", () => {
    const q = { start: "22:00", end: "07:00" };
    expect(inQuietHours("23:30", q)).toBe(true);
    expect(inQuietHours("06:59", q)).toBe(true);
    expect(inQuietHours("07:00", q)).toBe(false);
    expect(inQuietHours("12:00", { start: "13:00", end: "14:00" })).toBe(false);
  });
  it("sends the plan from its time until done, once", () => {
    expect(dueNotifications({ ...base, now: at("07:29") })).toEqual([]);
    expect(dueNotifications({ ...base, now: at("07:30") }).map((n) => n.key)).toEqual([`plan:${T}`]);
    expect(dueNotifications({ ...base, now: at("09:00"), dueTodayCount: 2 })[0].body).toMatch(/2 tasks are due today/);
    expect(dueNotifications({ ...base, now: at("11:00") })).toEqual([]); // more than 3 hours late
    expect(
      dueNotifications({ ...base, now: at("07:31"), rituals: [{ type: "daily_plan", date: T, completedAt: 1 }] }),
    ).toEqual([]);
    expect(dueNotifications({ ...base, now: at("07:31"), sent: new Set([`plan:${T}`]) })).toEqual([]);
  });
  it("respects per-type switches, quiet hours and the review day", () => {
    const off = {
      ...base,
      settings: { timezone: "UTC", notify: { plan: false, shutdown: true, review: true, habits: true, focus: true } },
    };
    expect(dueNotifications({ ...off, now: at("07:30") })).toEqual([]);
    // Shutdown set inside quiet hours: held back.
    const late = {
      ...base,
      settings: { timezone: "UTC", ritualTimes: { plan: "07:30", shutdown: "22:30", review: "18:00" } },
    };
    expect(dueNotifications({ ...late, now: at("22:31") })).toEqual([]);
    const cycles = [{ id: "c1", number: 1, endDate: T, reviewCompletedAt: null }];
    expect(dueNotifications({ ...base, cycles, now: at("18:05") }).map((n) => n.key)).toEqual([`review:c1`]);
  });
  it("habit reminders only for habits still due; focus ends get through quiet hours", () => {
    const h = habit({ reminderTime: "19:00" });
    expect(dueNotifications({ ...base, habits: [h], now: at("19:01") }).map((n) => n.key)).toEqual([
      `habit:${h.id}:${T}`,
    ]);
    expect(dueNotifications({ ...base, habits: [h], habitLogs: logs([T]), now: at("19:01") })).toEqual([]);
    const focus = {
      id: "rf1",
      kind: "focus_end" as const,
      title: "Time's up",
      body: "",
      url: "/today",
      fireAt: at("23:00"),
      status: "pending" as const,
    };
    expect(dueNotifications({ ...base, reminders: [focus], now: at("23:01") }).map((n) => n.key)).toEqual([
      `reminder:rf1:${at("23:00")}`,
    ]);
    expect(dueNotifications({ ...base, reminders: [{ ...focus, status: "cancelled" }], now: at("23:01") })).toEqual([]);
  });
});

describe("XP on the local database", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 12, 9));
  });
  afterEach(() => vi.useRealTimers());

  it("a task is awarded once; undoing takes it back and redoing restores it", async () => {
    const db = openLocalDb(`xp-${Math.random().toString(36).slice(2)}`);
    const actions = createActions(
      new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch),
      "user0000000001",
    );
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createTask({ title: "Write", status: "todo", effort: 2 });
    vi.setSystemTime(Date.UTC(2026, 10, 12, 10)); // an hour later: not "instant"
    const get = async () => (await db.tasks.get(id))!;
    await actions.setTaskDone(await get(), true);
    await actions.setTaskDone(await get(), true); // e.g. the same completion from a second device
    const xp = () => db.xpEvents.toArray();
    expect((await xp()).map((e) => e.amount)).toEqual([20]);
    await actions.setTaskDone(await get(), false);
    expect(totalXp(await xp())).toBe(0);
    await actions.setTaskDone(await get(), true);
    expect(totalXp(await xp())).toBe(20);
    expect(await db.xpEvents.count()).toBe(1);

    // A habit check-in, then unchecking.
    const habitId = await actions.createHabit({ name: "Stretch" });
    const h = (await db.habits.get(habitId))!;
    await actions.logHabit(h, "2026-11-12", 1);
    expect(totalXp(await xp())).toBe(25);
    await actions.logHabit(h, "2026-11-12", 0);
    expect(totalXp(await xp())).toBe(20);
  });
});

describe("reminder dispatch (server)", () => {
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

  it("sends each due reminder once, and forgets devices that are gone", async () => {
    db = client.db(`d${Math.random().toString(36).slice(2)}`);
    const userId = "user0000000001";
    await db.collection("settings").insertOne({ _id: `s${userId}` as never, userId, timezone: "UTC", deletedAt: null });
    await db.collection("pushSubscriptions").insertMany([
      { _id: "https://push.example/ok" as never, userId, keys: { p256dh: "p", auth: "a" } },
      { _id: "https://push.example/gone" as never, userId, keys: { p256dh: "p", auth: "a" } },
    ]);
    const sent: string[] = [];
    const send: Sender = async (sub, payload) => {
      if (sub._id.endsWith("gone")) return { ok: false, gone: true };
      sent.push(payload.title);
      return { ok: true };
    };
    const now = Date.parse(`${T}T07:35:00Z`);
    expect(await dispatchReminders(db, now, send)).toEqual({ users: 1, notifications: 1 });
    expect(sent).toEqual(["Plan your day"]);
    // A minute later: already sent.
    expect(await dispatchReminders(db, now + 60_000, send)).toEqual({ users: 0, notifications: 0 });
    expect(await db.collection("pushSubscriptions").countDocuments()).toBe(1);
  });
});
