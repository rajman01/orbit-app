import "fake-indexeddb/auto";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";
import type { Mutation } from "@/lib/sync/protocol";
import { pushRequestSchema } from "@/lib/sync/protocol";
import { applyMutations, pullChanges } from "@/lib/sync/server";
import { newTaskFields } from "@/features/tasks/model";

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
  db = client.db(`t${Math.random().toString(36).slice(2)}`);
});

let n = 0;
const id = () => `01TESTID${String(++n).padStart(8, "0")}`;
const upsert = (entityId: string, fields: Record<string, unknown>, clientTime: number): Mutation => ({
  mutationId: id(),
  entity: "tasks",
  entityId,
  op: "upsert",
  fields,
  clientTime,
});
const newTask = (title: string) => newTaskFields({ title, status: "todo", order: 1 });

describe("server sync", () => {
  it("creates, then returns the doc on pull without private fields", async () => {
    const t = id();
    const res = await applyMutations(db, "u1", [upsert(t, newTask("Write CV"), 1000)]);
    expect(res.applied).toHaveLength(1);
    const pull = await pullChanges(db, "u1", 0);
    expect(pull.changes).toHaveLength(1);
    expect(pull.changes[0].doc).toMatchObject({
      id: t,
      title: "Write CV",
      deletedAt: null,
    });
    expect(pull.changes[0].doc).not.toHaveProperty("userId");
    expect(pull.changes[0].doc).not.toHaveProperty("fieldUpdatedAt");
  });

  it("resolves conflicts per field: the later write wins each field", async () => {
    const t = id();
    await applyMutations(db, "u1", [upsert(t, newTask("A"), 1000)]);
    // Device 2 renames at t=3000; device 1 (offline) completes at t=2000 and renames at t=2000.
    await applyMutations(db, "u1", [upsert(t, { title: "B" }, 3000)]);
    await applyMutations(db, "u1", [upsert(t, { title: "C", status: "done" }, 2000)]);
    const { changes } = await pullChanges(db, "u1", 0);
    expect(changes[0].doc).toMatchObject({ title: "B", status: "done" });
  });

  it("is idempotent when the same mutation is pushed twice", async () => {
    const t = id();
    const m = upsert(t, newTask("A"), 1000);
    await applyMutations(db, "u1", [m]);
    const before = (await pullChanges(db, "u1", 0)).cursor;
    const again = await applyMutations(db, "u1", [m]);
    expect(again.applied).toEqual([m.mutationId]);
    expect((await pullChanges(db, "u1", 0)).cursor).toBe(before);
  });

  it("deletes win over later edits", async () => {
    const t = id();
    await applyMutations(db, "u1", [upsert(t, newTask("A"), 1000)]);
    await applyMutations(db, "u1", [
      {
        mutationId: id(),
        entity: "tasks",
        entityId: t,
        op: "delete",
        clientTime: 2000,
      },
    ]);
    await applyMutations(db, "u1", [upsert(t, { title: "zombie" }, 3000)]);
    const { changes } = await pullChanges(db, "u1", 0);
    expect(changes[0].doc).toMatchObject({ title: "A", deletedAt: 2000 });
  });

  it("never lets one user touch or see another user's data", async () => {
    const t = id();
    await applyMutations(db, "u1", [upsert(t, newTask("mine"), 1000)]);
    const res = await applyMutations(db, "u2", [upsert(t, { title: "stolen" }, 2000)]);
    expect(res.rejected[0].reason).toBe("forbidden");
    expect((await pullChanges(db, "u2", 0)).changes).toHaveLength(0);
    expect((await pullChanges(db, "u1", 0)).changes[0].doc.title).toBe("mine");
  });

  it("rejects invalid fields and incomplete creates", async () => {
    const res = await applyMutations(db, "u1", [
      upsert(id(), { title: "no status" }, 1000),
      upsert(id(), { ...newTask("x"), userId: "u2" }, 1000),
    ]);
    expect(res.rejected).toHaveLength(2);
  });

  it("clamps future device clocks so a bad clock can't lock a field", async () => {
    const t = id();
    await applyMutations(db, "u1", [upsert(t, newTask("A"), Date.now() + 10 * 365 * 864e5)]);
    await applyMutations(db, "u1", [upsert(t, { title: "B" }, Date.now() + 1000)]);
    expect((await pullChanges(db, "u1", 0)).changes[0].doc.title).toBe("B");
  });

  it("pages pull results in version order", async () => {
    await applyMutations(
      db,
      "u1",
      Array.from({ length: 5 }, (_, i) => upsert(id(), newTask(`t${i}`), 1000 + i)),
    );
    const p1 = await pullChanges(db, "u1", 0, 3);
    expect(p1.changes).toHaveLength(3);
    expect(p1.hasMore).toBe(true);
    const p2 = await pullChanges(db, "u1", p1.cursor, 3);
    expect(p2.changes).toHaveLength(2);
    expect(p2.hasMore).toBe(false);
  });

  it("numbers tasks per user, once, on the server", async () => {
    const [a, b] = [id(), id()];
    await applyMutations(db, "u1", [upsert(a, newTask("A"), 1000), upsert(b, newTask("B"), 1001)]);
    await applyMutations(db, "u1", [upsert(a, { title: "A2" }, 2000)]);
    await applyMutations(db, "u2", [upsert(id(), newTask("other user"), 1000)]);
    const docs = (await pullChanges(db, "u1", 0)).changes.map((c) => c.doc);
    expect(docs.find((d) => d.id === a)?.number).toBe(1);
    expect(docs.find((d) => d.id === b)?.number).toBe(2);
    expect((await pullChanges(db, "u2", 0)).changes[0].doc.number).toBe(1);
  });

  it("accepts tasks created by older clients without the Phase 1B fields", async () => {
    const { mustDoDate: _m, postponeCount: _p, ...old } = newTask("From an old PWA");
    const res = await applyMutations(db, "u1", [upsert(id(), old, 1000)]);
    expect(res.rejected).toEqual([]);
  });

  it("syncs focus sessions and checks their task belongs to the user", async () => {
    const t = id();
    await applyMutations(db, "u1", [upsert(t, newTask("Deep work"), 1000)]);
    const session = {
      taskId: t,
      mode: "five",
      plannedMinutes: 5,
      startedAt: 1000,
      endedAt: null,
      actualMinutes: 0,
      outcome: null,
      interruptions: 0,
    };
    const mine = await applyMutations(db, "u1", [
      { mutationId: id(), entity: "focusSessions", entityId: id(), op: "upsert", fields: session, clientTime: 1001 },
    ]);
    expect(mine.applied).toHaveLength(1);
    const theirs = await applyMutations(db, "u2", [
      { mutationId: id(), entity: "focusSessions", entityId: id(), op: "upsert", fields: session, clientTime: 1001 },
    ]);
    expect(theirs.rejected[0].reason).toMatch(/forbidden reference/);
  });

  it("rejects references to another user's documents but allows unknown ones", async () => {
    const goal = id();
    await applyMutations(db, "u1", [
      {
        mutationId: id(),
        entity: "goals",
        entityId: goal,
        op: "upsert",
        clientTime: 1000,
        fields: {
          areaId: null,
          title: "G",
          description: "",
          status: "active",
          health: null,
          priority: "none",
          startDate: null,
          targetDate: null,
          droppedReason: null,
          completedAt: null,
          order: 0,
        },
      },
    ]);
    const stolen = await applyMutations(db, "u2", [upsert(id(), { ...newTask("x"), goalId: goal }, 1000)]);
    expect(stolen.rejected[0].reason).toBe("forbidden reference: goalId");
    const pending = await applyMutations(db, "u2", [upsert(id(), { ...newTask("y"), goalId: id() }, 1000)]);
    expect(pending.applied).toHaveLength(1);
  });

  it("validates push payloads", () => {
    expect(
      pushRequestSchema.safeParse({
        mutations: [{ ...upsert(id(), {}, 1), entity: "users" }],
      }).success,
    ).toBe(false);
  });
});

/** Routes the engine's fetch calls straight to the server functions for a given user. */
function fakeServer(userId: string, state: { online: boolean }): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!state.online) throw new TypeError("Failed to fetch");
    const url = new URL(String(input), "http://x");
    if (url.pathname === "/api/sync/push") {
      const body = pushRequestSchema.parse(JSON.parse(String(init!.body)));
      return Response.json(await applyMutations(db, userId, body.mutations));
    }
    return Response.json(await pullChanges(db, userId, Number(url.searchParams.get("since"))));
  }) as typeof fetch;
}

describe("client engine (offline → online)", () => {
  it("writes locally while offline, then syncs to a second device", async () => {
    const net = { online: false };
    const phone = new SyncEngine(openLocalDb(`phone-${id()}`), fakeServer("u1", net));
    const laptop = new SyncEngine(openLocalDb(`laptop-${id()}`), fakeServer("u1", net));

    const taskId = await phone.create("tasks", newTask("Call mum") as never);
    await phone.update("tasks", taskId, { status: "done" });
    await phone.sync();
    expect(phone.status.state).toBe("offline");
    expect(phone.status.pending).toBe(2);
    expect((await phone.db.tasks.get(taskId))?.status).toBe("done"); // visible locally right away

    net.online = true;
    await phone.sync();
    expect(phone.status).toMatchObject({ state: "idle", pending: 0 });

    await laptop.sync();
    expect(await laptop.db.tasks.get(taskId)).toMatchObject({
      title: "Call mum",
      status: "done",
    });
  });

  it("keeps unsynced local edits on top of incoming server changes", async () => {
    const net = { online: true };
    const a = new SyncEngine(openLocalDb(`a-${id()}`), fakeServer("u1", net));
    const b = new SyncEngine(openLocalDb(`b-${id()}`), fakeServer("u1", net));
    const taskId = await a.create("tasks", newTask("Draft") as never);
    await a.sync();
    await b.sync();

    net.online = false;
    await b.update("tasks", taskId, { title: "Local title" }); // pending on b
    net.online = true;
    await a.update("tasks", taskId, { status: "in_progress" });
    await a.sync();

    // b pulls before pushing would normally happen; simulate by pulling via sync (push happens first, fine)
    await b.sync();
    expect(await b.db.tasks.get(taskId)).toMatchObject({
      title: "Local title",
      status: "in_progress",
    });
  });
});

describe("concurrent pushes", () => {
  it("applies the same new document from two requests at once without failing", async () => {
    const t = id();
    const a = upsert(t, newTask("A"), 1000);
    const b = { ...a, mutationId: id() };
    const results = await Promise.all([applyMutations(db, "u1", [a]), applyMutations(db, "u1", [b])]);
    expect(results.flatMap((r) => r.rejected)).toEqual([]);
    expect((await pullChanges(db, "u1", 0)).changes.filter((c) => c.doc.id === t)).toHaveLength(1);
  });
});
