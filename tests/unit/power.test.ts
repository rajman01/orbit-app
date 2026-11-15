import "fake-indexeddb/auto";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { habitLogId } from "@/features/habits/model";
import { notificationActions, notificationMeta } from "@/features/reminders/model";
import { newTaskFields, type Task } from "@/features/tasks/model";
import { DEFAULT_FILTERS, filterTasks, rangeBetween, sameFilters, suggestViewName } from "@/features/tasks/views";
import { xpEventId } from "@/features/xp/model";
import { openLocalDb } from "@/lib/local-db/db";
import { KEEP_MS, notificationAction, recordNotification, SNOOZE_MS } from "@/lib/notifications/server";
import { dispatchReminders, type PushPayload, type Sender } from "@/lib/push/server";
import { SyncEngine } from "@/lib/sync/engine";
import { applyMutations } from "@/lib/sync/server";

vi.mock("server-only", () => ({}));

const task = (p: Partial<Task>): Task =>
  ({
    ...newTaskFields({ title: "T", status: "todo" }),
    id: Math.random().toString(36).slice(2),
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    serverVersion: 0,
    ...p,
  }) as Task;

describe("saved views (CMD-4)", () => {
  const tasks = [
    task({ id: "a", areaId: "career", priority: "high", cycleId: null }),
    task({ id: "b", areaId: "career", priority: "high", cycleId: "c1" }),
    task({ id: "c", areaId: "career", priority: "low", cycleId: null }),
    task({ id: "d", areaId: "health", priority: "urgent", cycleId: null }),
    task({ id: "e", areaId: "career", priority: "urgent", status: "done" }),
    task({ id: "f", areaId: "career", status: "inbox" }),
  ];

  it("filters by area, priority band and cycle", () => {
    const f = { ...DEFAULT_FILTERS, areaId: "career", priorities: ["urgent", "high"] as const, cycle: "none" as const };
    expect(filterTasks(tasks, { ...f, priorities: [...f.priorities] }, "c1").map((t) => t.id)).toEqual(["a"]);
    expect(filterTasks(tasks, { ...DEFAULT_FILTERS, cycle: "current" }, "c1").map((t) => t.id)).toEqual(["b"]);
    expect(filterTasks(tasks, { ...DEFAULT_FILTERS, cycle: "current" }, null)).toEqual([]);
    // Done only when asked for; the Inbox never.
    expect(filterTasks(tasks, DEFAULT_FILTERS, null).map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterTasks(tasks, { ...DEFAULT_FILTERS, showDone: true }, null).map((t) => t.id)).toContain("e");
  });

  it("knows when filters changed, and suggests a name", () => {
    expect(sameFilters(DEFAULT_FILTERS, { ...DEFAULT_FILTERS, priorities: [] })).toBe(true);
    expect(
      sameFilters(
        { ...DEFAULT_FILTERS, priorities: ["high", "urgent"] },
        { ...DEFAULT_FILTERS, priorities: ["urgent", "high"] },
      ),
    ).toBe(true);
    expect(sameFilters(DEFAULT_FILTERS, { ...DEFAULT_FILTERS, cycle: "none" })).toBe(false);
    expect(
      suggestViewName(
        { ...DEFAULT_FILTERS, priorities: ["urgent", "high"], cycle: "none" },
        { area: "Career", priorities: "High and above" },
      ),
    ).toBe("Career, high and above, not in a cycle");
    expect(suggestViewName(DEFAULT_FILTERS, {})).toBe("My view");
  });
});

describe("bulk actions (TASK-7)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 15, 9));
  });
  afterEach(() => vi.useRealTimers());

  it("Shift-click selects the range between two rows", () => {
    expect(rangeBetween(["a", "b", "c", "d"], "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(["a", "b"], "x", "b")).toEqual(["b"]);
  });

  it("change several tasks at once, with history", async () => {
    const db = openLocalDb(`bulk-${Math.random().toString(36).slice(2)}`);
    const actions = createActions(
      new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch),
      "user0000000001",
    );
    await actions.saveSettings({ timezone: "UTC" });
    const ids: string[] = [];
    for (const title of ["One", "Two", "Three"]) ids.push(await actions.createTask({ title, status: "backlog" }));
    const get = async () => (await db.tasks.bulkGet(ids)) as Task[];

    await actions.bulkUpdateTasks(await get(), { priority: "high", dueDate: "2026-11-20" });
    expect((await get()).map((t) => [t.priority, t.dueDate])).toEqual(Array(3).fill(["high", "2026-11-20"]));
    // Each date change is in the task's history, as if made one by one.
    expect((await db.taskEvents.toArray()).filter((e) => e.type === "reschedule")).toHaveLength(3);

    await actions.bulkSetCycle(await get(), "cycle000000001");
    expect((await get()).map((t) => [t.cycleId, t.status])).toEqual(Array(3).fill(["cycle000000001", "todo"]));
    await actions.bulkSetCycle(await get(), null);
    expect((await get()).every((t) => t.cycleId === null)).toBe(true);

    await actions.bulkDeleteTasks((await get()).slice(0, 2));
    expect((await get()).map((t) => t.deletedAt != null)).toEqual([true, true, false]);
  });

  it("saves, updates and deletes a view", async () => {
    const db = openLocalDb(`views-${Math.random().toString(36).slice(2)}`);
    const actions = createActions(
      new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch),
      "user0000000001",
    );
    const a = await actions.saveView(" Career ", { ...DEFAULT_FILTERS, areaId: "career0000001" });
    const b = await actions.saveView("Urgent", { ...DEFAULT_FILTERS, priorities: ["urgent"] });
    expect((await db.savedViews.bulkGet([a, b])).map((v) => [v!.name, v!.order])).toEqual([
      ["Career", 1],
      ["Urgent", 2],
    ]);
    await actions.updateView(a, { filters: { ...DEFAULT_FILTERS, cycle: "none" } });
    expect((await db.savedViews.get(a))!.filters.cycle).toBe("none");
    await actions.deleteView(b);
    expect((await db.savedViews.get(b))!.deletedAt).not.toBeNull();
  });
});

describe("notification records (NOT-5) and actions (NOT-3)", () => {
  it("knows what a notification is about from its key", () => {
    expect(notificationMeta("habit:habit00000001:2026-11-15")).toEqual({ kind: "habit", ref: "habit00000001" });
    expect(notificationMeta("reminder:rem0000000001:123")).toEqual({ kind: "reminder", ref: "rem0000000001" });
    expect(notificationMeta("plan:2026-11-15")).toEqual({ kind: "plan", ref: null });
    expect(notificationMeta("qreview:20264")).toEqual({ kind: "quarter", ref: null });
    expect(notificationMeta("whatever")).toEqual({ kind: "other", ref: null });
    expect(notificationActions("habit")).toEqual([{ action: "done", title: "Done" }]);
    expect(notificationActions("reminder")).toEqual([{ action: "snooze", title: "Snooze 15 min" }]);
    expect(notificationActions("plan")).toEqual([]);
  });

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
  beforeEach(() => {
    db = client.db(`n${Math.random().toString(36).slice(2)}`);
  });

  const userId = "user0000000001";
  const NOW = Date.parse("2026-11-15T07:35:00Z");
  let n = 0;
  const mid = () => `01MUTPWR${String(++n).padStart(8, "0")}`;

  async function seed() {
    await applyMutations(db, userId, [
      {
        mutationId: mid(),
        entity: "settings",
        entityId: `s${userId}`,
        op: "upsert",
        clientTime: NOW,
        fields: {
          timezone: "UTC",
          weekStartDay: 1,
          cycleLengthDays: 14,
          dailyCapacityPts: 8,
          cycleCapacityPts: 30,
          workingHours: { start: "09:00", end: "17:00" },
          strictness: "firm",
          onboardingCompletedAt: 1,
        },
      },
      {
        mutationId: mid(),
        entity: "habits",
        entityId: "habit00000001",
        op: "upsert",
        clientTime: NOW,
        fields: {
          name: "Stretch",
          areaId: null,
          goalId: null,
          schedule: { type: "daily" },
          targetType: "count",
          targetCount: 10,
          unit: "min",
          reminderTime: "07:35",
          archivedAt: null,
          order: 0,
        },
      },
      {
        mutationId: mid(),
        entity: "reminders",
        entityId: "rem0000000001",
        op: "upsert",
        clientTime: NOW,
        fields: { kind: "custom", title: "Call", body: "", url: "/today", fireAt: NOW - 60_000, status: "pending" },
      },
    ]);
    await db
      .collection("pushSubscriptions")
      .insertOne({ _id: "https://push.example/a" as never, userId, keys: { p256dh: "p", auth: "a" } });
  }

  it("records what's sent, with buttons for habits and reminders", async () => {
    await seed();
    const sent: PushPayload[] = [];
    const send: Sender = async (_s, p) => {
      sent.push(p);
      return { ok: true };
    };
    await dispatchReminders(db, NOW, send);
    const habitPush = sent.find((p) => p.title === "Stretch")!;
    const reminderPush = sent.find((p) => p.title === "Call")!;
    expect(habitPush.actions).toEqual([{ action: "done", title: "Done" }]);
    expect(reminderPush.actions).toEqual([{ action: "snooze", title: "Snooze 15 min" }]);
    const rows = await db.collection("notifications").find({ userId }).toArray();
    expect(rows.map((r) => [r.title, r.kind, r.ref, r.readAt]).sort()).toEqual(
      [
        ["Call", "reminder", "rem0000000001", null],
        ["Plan your day", "plan", null, null],
        ["Stretch", "habit", "habit00000001", null],
      ].sort(),
    );
    expect(rows.find((r) => r.kind === "habit")!._id).toBe(habitPush.id);
  });

  it("Done logs the habit with its XP; Snooze moves the reminder; both mark it read", async () => {
    await seed();
    const sent: PushPayload[] = [];
    await dispatchReminders(db, NOW, async (_s, p) => (sent.push(p), { ok: true }));
    const habitId = sent.find((p) => p.title === "Stretch")!.id!;
    const reminderId = sent.find((p) => p.title === "Call")!.id!;

    expect(await notificationAction(db, userId, { id: habitId, action: "done" }, NOW + 1000)).toEqual({ ok: true });
    const logId = habitLogId("habit00000001", "2026-11-15");
    expect(await db.collection("habitLogs").findOne({ _id: logId as never })).toMatchObject({ value: 10 });
    expect(await db.collection("xpEvents").findOne({ _id: xpEventId("habit", logId) as never })).toMatchObject({
      source: "habit",
      amount: 5,
    });
    expect((await db.collection("notifications").findOne({ _id: habitId as never }))!.readAt).toBe(NOW + 1000);
    // Snooze isn't for habits.
    expect((await notificationAction(db, userId, { id: habitId, action: "snooze" }, NOW)).ok).toBe(false);

    expect(await notificationAction(db, userId, { id: reminderId, action: "snooze" }, NOW + 2000)).toEqual({
      ok: true,
    });
    expect(await db.collection("reminders").findOne({ _id: "rem0000000001" as never })).toMatchObject({
      fireAt: NOW + 2000 + SNOOZE_MS,
      status: "pending",
    });
    // Another user's notification can't be touched.
    expect((await notificationAction(db, "user0000000002", { id: reminderId, action: "open" }, NOW)).ok).toBe(false);
  });

  it("devices may only mark notifications read", async () => {
    await seed();
    const id = await recordNotification(
      db,
      userId,
      { key: "plan:2026-11-15", title: "Plan your day", body: "", url: "/today", tag: "orbit-plan" },
      NOW,
    );
    const device = (fields: Record<string, unknown>, entityId = id!) =>
      applyMutations(db, userId, [
        { mutationId: mid(), entity: "notifications", entityId, op: "upsert", fields, clientTime: NOW },
      ]);
    expect((await device({ readAt: NOW })).applied).toHaveLength(1);
    expect((await device({ title: "Hacked" })).rejected).toHaveLength(1);
    expect((await device({ title: "New" }, "01NEWNOTE0000000001")).rejected).toHaveLength(1);
    expect((await db.collection("notifications").findOne({ _id: id as never }))!.title).toBe("Plan your day");
  });

  it("keeps 60 days of history", async () => {
    await seed();
    const n1 = { key: "plan:a", title: "Old", body: "", url: "/today", tag: "t" };
    const old = await recordNotification(db, userId, n1, NOW - KEEP_MS - 1000);
    await recordNotification(db, userId, { ...n1, title: "New" }, NOW);
    expect((await db.collection("notifications").findOne({ _id: old as never }))!.deletedAt).not.toBeNull();
  });
});
