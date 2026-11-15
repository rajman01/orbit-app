import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { capture } from "@/lib/account/capture";
import { connections, deleteAccount, exportData, exportMarkdown } from "@/lib/account/server";
import { createToken, hashToken, listTokens, revokeToken, userForToken } from "@/lib/account/tokens";
import { applyMutations } from "@/lib/sync/server";
import { ENTITY_NAMES, type EntityName } from "@/lib/sync/entities";
import type { Mutation } from "@/lib/sync/protocol";
import { newTaskFields } from "@/features/tasks/model";

vi.mock("server-only", () => ({}));

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
  db = client.db(`a${Math.random().toString(36).slice(2)}`);
});

const U1 = new ObjectId().toHexString();
const U2 = new ObjectId().toHexString();
let n = 0;
const mid = () => `01MUTACC${String(++n).padStart(8, "0")}`;
const upsert = (entity: EntityName, entityId: string, fields: Record<string, unknown>): Mutation => ({
  mutationId: mid(),
  entity,
  entityId,
  op: "upsert",
  fields,
  clientTime: Date.now(),
});
const settings = (userId: string) =>
  upsert("settings", `s${userId}`, {
    timezone: "UTC",
    weekStartDay: 1,
    cycleLengthDays: 14,
    dailyCapacityPts: 8,
    cycleCapacityPts: 30,
    workingHours: { start: "09:00", end: "17:00" },
    strictness: "firm",
    onboardingCompletedAt: 1,
  });

describe("API tokens (SET-8)", () => {
  it("are shown once, stored as a hash, listed, used and revoked", async () => {
    const made = (await createToken(db, U1, " iPhone "))!;
    expect(made.token).toMatch(/^orb_[\w-]{40,}$/);
    const stored = await db.collection("apiTokens").findOne({ _id: made.id as never });
    expect(stored).toMatchObject({ userId: U1, name: "iPhone", hash: hashToken(made.token) });
    expect(JSON.stringify(stored)).not.toContain(made.token);
    expect(await listTokens(db, U1)).toMatchObject([{ id: made.id, name: "iPhone", lastUsedAt: null }]);
    expect(await userForToken(db, `Bearer ${made.token}`)).toBe(U1);
    expect((await listTokens(db, U1))[0].lastUsedAt).not.toBeNull();
    expect(await userForToken(db, "Bearer orb_wrongwrongwrongwrongwrong")).toBeNull();
    expect(await userForToken(db, null)).toBeNull();
    expect(await revokeToken(db, U2, made.id)).toBe(false); // not theirs
    expect(await revokeToken(db, U1, made.id)).toBe(true);
    expect(await userForToken(db, `Bearer ${made.token}`)).toBeNull();
    for (let i = 0; i < 10; i++) await createToken(db, U1, `t${i}`);
    expect(await createToken(db, U1, "eleventh")).toBeNull();
  });
});

describe("capture (§13)", () => {
  it("parses like Quick Add and syncs like any task", async () => {
    await applyMutations(db, U1, [
      settings(U1),
      upsert("areas", "01AREAFINANCE0001", {
        name: "Finance",
        icon: "wallet",
        color: "green",
        description: "",
        order: 1,
        archivedAt: null,
      }),
    ]);
    const now = Date.parse("2026-11-15T09:00:00Z");
    const inbox = await capture(db, U1, { text: "  Buy   milk ", note: "2% please" }, now);
    expect(inbox).toMatchObject({ ok: true, title: "Buy milk", status: "inbox" });
    const placed = await capture(db, U1, { text: "Call the bank tomorrow !2 #finance" }, now);
    expect(placed).toMatchObject({ ok: true, title: "Call the bank", status: "todo", dueDate: "2026-11-16" });
    const task = await db.collection("tasks").findOne({ _id: (placed as { id: string }).id as never });
    expect(task).toMatchObject({
      userId: U1,
      priority: "high",
      areaId: "01AREAFINANCE0001",
      createdBy: "capture",
      number: 2,
    });
    expect(await db.collection("tasks").findOne({ _id: (inbox as { id: string }).id as never })).toMatchObject({
      description: "2% please",
    });
    expect(await db.collection("taskEvents").countDocuments({ userId: U1, reason: "capture" })).toBe(2);
    expect(await capture(db, U1, { text: "   " })).toMatchObject({ ok: false });
  });
});

describe("export and delete (SET-7)", () => {
  async function seed(userId: string, title: string) {
    await db.collection("user").insertOne({ _id: new ObjectId(userId), name: title, email: `${title}@x.test` });
    await db.collection("session").insertOne({ userId: new ObjectId(userId), token: `s-${title}` });
    await db.collection("account").insertOne({ userId: new ObjectId(userId), providerId: "credential" });
    await applyMutations(db, userId, [
      settings(userId),
      upsert("goals", `01GOAL${title.toUpperCase().padEnd(10, "X")}`, {
        areaId: null,
        title: `${title} goal`,
        description: "Why it matters",
        status: "active",
        health: null,
        priority: "none",
        startDate: null,
        targetDate: "2026-12-31",
        droppedReason: null,
        completedAt: null,
        order: 1,
      }),
      upsert("tasks", `01TASK${title.toUpperCase().padEnd(10, "X")}`, newTaskFields({ title: `${title} task` })),
      upsert("journalEntries", `j20261115${userId}`.slice(0, 40), {
        date: "2026-11-15",
        text: "A good day",
        mood: 4,
        energy: 3,
        prompts: [],
      }),
      upsert("wins", `01WIN${title.toUpperCase().padEnd(11, "X")}`, {
        date: "2026-11-15",
        title: `${title} win`,
        description: "",
        impact: "Big",
        areaId: null,
        goalId: null,
        taskId: null,
        links: [],
        source: "manual",
      }),
    ]);
    await createToken(db, userId, "phone");
    await db.collection("aiUsage").insertOne({ _id: `${userId}:2026-11-15` as never, tokens: 5 });
  }

  it("exports a user's own data, readable as markdown", async () => {
    await seed(U1, "ada");
    await seed(U2, "bob");
    await applyMutations(db, U1, [{ ...upsert("tasks", "01TASKADAXXXXXXX", {}), op: "delete" }]);
    const out = await exportData(db, U1, new Date("2026-11-15T10:00:00Z"));
    expect(Object.keys(out.data).sort()).toEqual([...ENTITY_NAMES].sort());
    expect(out.account).toMatchObject({ name: "ada", email: "ada@x.test" });
    expect(out.data.goals).toMatchObject([{ id: "01GOALADAXXXXXXX", title: "ada goal" }]);
    expect(out.data.goals[0]).not.toHaveProperty("userId");
    expect(out.data.tasks).toEqual([]); // deleted
    expect(JSON.stringify(out)).not.toContain("bob");
    const md = exportMarkdown(out);
    expect(md).toContain("## Goals\n\n### ada goal\n\nactive · by 2026-12-31\n\nWhy it matters");
    expect(md).toContain("### 2026-11-15 (mood 4/5, energy 3/5)\n\nA good day");
    expect(md).toContain("- **ada win** (2026-11-15)\n  *Impact:* Big");
    expect(await connections(db, U1)).toMatchObject({ email: "ada@x.test", signIn: ["password"], tokens: 1 });
  });

  it("deletes everything of one account and nothing of another", async () => {
    await seed(U1, "ada");
    await seed(U2, "bob");
    await deleteAccount(db, U1);
    for (const name of (await db.listCollections().toArray()).map((c) => c.name)) {
      const c = db.collection(name);
      expect(await c.countDocuments({ userId: U1 }), name).toBe(0);
      expect(await c.countDocuments({ userId: new ObjectId(U1) }), name).toBe(0);
      expect(await c.countDocuments({ _id: { $regex: `^${U1}` } as never }), name).toBe(0);
    }
    expect(await db.collection("user").countDocuments({ _id: new ObjectId(U1) })).toBe(0);
    // Bob is untouched.
    expect(await db.collection("user").countDocuments({ _id: new ObjectId(U2) })).toBe(1);
    expect(await db.collection("session").countDocuments({ userId: new ObjectId(U2) })).toBe(1);
    expect(await db.collection("goals").countDocuments({ userId: U2 })).toBe(1);
    expect(await db.collection("apiTokens").countDocuments({ userId: U2 })).toBe(1);
    expect(await db.collection("syncCounters").countDocuments({ _id: U2 as never })).toBe(1);
    expect(await db.collection("aiUsage").countDocuments({ _id: `${U2}:2026-11-15` as never })).toBe(1);
  });
});
