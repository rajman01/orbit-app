import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { coachContext, requestMessages, runCoachTool } from "@/features/coach/device";
import { coachRequestSchema, type CoachEvent, type CoachMessage } from "@/features/coach/protocol";
import { COACH_TOOLS, toolDefinitions } from "@/features/coach/tools";
import { BULK_LIMIT } from "@/features/coach/tools";
import { recordingEngine } from "@/features/coach/record";
import { acceptProposal, dismissProposal, undoAction } from "@/features/coach/write-tools";
import { totalXp } from "@/features/xp/model";
import { instantAt } from "@/lib/dates";
import { fakeCoachTurn } from "@/lib/coach/fake";
import { openLocalDb } from "@/lib/local-db/db";
import { entitySchemas } from "@/lib/sync/entities";
import { SyncEngine } from "@/lib/sync/engine";

vi.mock("server-only", () => ({}));

const USER = "user0000000001";

function setup() {
  const db = openLocalDb(`coach-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
  const actions = createActions(engine, USER);
  return { db, engine, actions, deps: { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } } };
}

describe("coach tools", () => {
  it("are described to the model in a fixed order, as plain object schemas", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(Object.keys(COACH_TOOLS));
    for (const d of defs) {
      expect(d.input_schema.type).toBe("object");
      expect(d.input_schema).not.toHaveProperty("$schema");
      expect(d.description.length).toBeGreaterThan(20);
    }
    // Same output twice: the tool list is part of the cached prefix.
    expect(JSON.stringify(toolDefinitions())).toBe(JSON.stringify(defs));
  });
});

describe("conversation sent to the API", () => {
  const text = (role: CoachMessage["role"], t: string): CoachMessage => ({
    role,
    content: [{ type: "text", text: t }],
  });

  it("keeps the context right after a user message", () => {
    const msgs = [text("user", "hi"), text("system", "ctx"), text("assistant", "hello")];
    expect(requestMessages(msgs)).toEqual(msgs);
    expect(requestMessages(msgs.slice(0, 2))).toEqual(msgs.slice(0, 2));
  });

  it("drops a context message left behind by a failed turn", () => {
    const msgs = [text("user", "hi"), text("system", "ctx1"), text("user", "again"), text("system", "ctx2")];
    expect(requestMessages(msgs).map((m) => (m.content[0] as { text: string }).text)).toEqual(["hi", "again", "ctx2"]);
  });

  it("stored messages match what the server accepts", () => {
    const msgs = [text("user", "hi"), text("system", "ctx")];
    expect(coachRequestSchema.safeParse({ messages: msgs }).success).toBe(true);
    expect(
      entitySchemas.aiMessages.safeParse({
        threadId: "t".repeat(12),
        seq: 0,
        role: "user",
        content: msgs[0].content,
        at: 1,
      }).success,
    ).toBe(true);
  });
});

describe("tools run on the device", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 14, 9));
  });
  afterEach(() => vi.useRealTimers());

  it("overview, search and get_task read the local database", async () => {
    const { actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createTask({
      title: "Write the CV summary",
      status: "todo",
      effort: 3,
      scheduledDate: "2026-11-14",
    });
    await actions.createTask({ title: "Book dentist", status: "todo", dueDate: "2026-11-10" });

    const overview = JSON.parse((await runCoachTool("get_overview", {}, deps)).content);
    expect(overview.alsoToday.map((t: { title: string }) => t.title)).toEqual(["Write the CV summary"]);
    expect(overview.overdueCount).toBe(1);

    const found = JSON.parse((await runCoachTool("search", { query: "cv write" }, deps)).content);
    expect(found.matches).toHaveLength(1);
    expect(found.matches[0]).toMatchObject({ kind: "task", id, title: "Write the CV summary" });

    const task = JSON.parse((await runCoachTool("get_task", { id }, deps)).content);
    expect(task).toMatchObject({ id, effort: 3, subtasks: [] });
  });

  it("bad input and unknown tools come back as errors, not exceptions", async () => {
    const { deps } = setup();
    expect(await runCoachTool("search", { query: "" }, deps)).toMatchObject({ isError: true });
    expect(await runCoachTool("delete_everything", {}, deps)).toMatchObject({ isError: true });
  });

  it("remember and forget keep notes that appear in the context", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    await runCoachTool("remember", { text: "Prefers deep work in the morning" }, deps);
    let ctx = await coachContext(db, USER, Date.now());
    expect(ctx).toContain("Prefers deep work in the morning");
    expect(ctx).toContain("09:00 (UTC)");
    const memory = (await db.aiMemories.toArray())[0];
    expect((await runCoachTool("forget", { id: memory.id }, deps)).content).toBe("Forgotten.");
    ctx = await coachContext(db, USER, Date.now());
    expect(ctx).not.toContain("deep work");
  });
});

describe("fake model used by the browser tests", () => {
  const collect = async (msgs: CoachMessage[]) => {
    const out: CoachEvent[] = [];
    for await (const e of fakeCoachTurn(msgs)) out.push(e);
    return out.at(-1)!;
  };

  it("echoes, calls a tool on request, and answers tool results", async () => {
    expect(await collect([{ role: "user", content: [{ type: "text", text: "hello" }] }])).toMatchObject({
      t: "message",
      content: [{ type: "text", text: "You said: hello" }],
    });
    const call = await collect([
      { role: "user", content: [{ type: "text", text: 'go [tool:search {"query":"cv"}]' }] },
    ]);
    expect(call).toMatchObject({ t: "message", stopReason: "tool_use" });
    expect((call as { content: Record<string, unknown>[] }).content[1]).toMatchObject({
      name: "search",
      input: { query: "cv" },
    });
    expect(
      await collect([{ role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "found 1" }] }]),
    ).toMatchObject({ content: [{ text: "Done: found 1" }] });
  });
});

describe("the coach acting (2A.2)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 14, 9));
  });
  afterEach(() => vi.useRealTimers());

  const lastAction = async (db: ReturnType<typeof setup>["db"]) =>
    (await db.aiActions.toArray()).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).at(-1)!;

  it("creates a task as the coach's work, and Undo takes it back", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const out = await runCoachTool("create_task", { title: "Draft the cover letter", effort: 2 }, deps);
    expect(out.isError).toBeUndefined();
    const { id } = JSON.parse(out.content);
    const task = (await db.tasks.get(id))!;
    expect(task).toMatchObject({ title: "Draft the cover letter", status: "todo", createdBy: "ai", effort: 2 });
    expect((await db.taskEvents.where("taskId").equals(id).toArray())[0].actor).toBe("ai");

    const action = await lastAction(db);
    expect(action).toMatchObject({
      status: "applied",
      tool: "create_task",
      summary: "Create task “Draft the cover letter”",
    });
    await undoAction(engine, action.id);
    expect((await db.tasks.get(id))!.deletedAt).not.toBeNull();
    expect((await db.aiActions.get(action.id))!.status).toBe("undone");
  });

  it("undoing a completion reopens the task and takes the XP back", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createTask({ title: "Send invoice", status: "todo", effort: 2 });
    vi.setSystemTime(Date.UTC(2026, 10, 14, 10));
    await runCoachTool("complete_task", { id }, deps);
    expect((await db.tasks.get(id))!.status).toBe("done");
    expect(totalXp(await db.xpEvents.toArray())).toBeGreaterThan(0);
    await undoAction(engine, (await lastAction(db)).id);
    expect((await db.tasks.get(id))!).toMatchObject({ status: "todo", completedAt: null });
    expect(totalXp(await db.xpEvents.toArray())).toBe(0);
  });

  it("undo leaves alone a field the user has changed since", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createTask({ title: "Plan trip", status: "todo" });
    await runCoachTool("update_task", { id, priority: "high", nextStep: "Open the flights page" }, deps);
    await actions.updateTask((await db.tasks.get(id))!, { priority: "low" }); // the user, afterwards
    await undoAction(engine, (await lastAction(db)).id);
    expect((await db.tasks.get(id))!).toMatchObject({ priority: "low", nextStep: null });
  });

  it("in Suggest only, nothing changes until the suggestion is accepted", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC", aiAutonomy: "suggest" });
    const out = await runCoachTool("create_goal", { title: "Run a half marathon" }, deps);
    expect(out.content).toMatch(/^Not done yet/);
    expect(await db.goals.count()).toBe(0);
    const proposal = await lastAction(db);
    expect(proposal.status).toBe("proposed");
    await acceptProposal(proposal.id, deps);
    expect((await db.goals.toArray()).map((g) => g.title)).toEqual(["Run a half marathon"]);
    expect((await db.aiActions.get(proposal.id))!.status).toBe("applied");

    await runCoachTool("create_goal", { title: "Learn Spanish" }, deps);
    const spanish = (await db.aiActions.toArray()).find((x) => x.summary === "Create goal “Learn Spanish”")!;
    await dismissProposal(engine, spanish.id);
    expect(await db.goals.count()).toBe(1);
  });

  it("dropping a goal and big bursts of changes always ask first", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const goalId = await actions.createGoal({ title: "Old plan", status: "active" });
    await runCoachTool("update_goal", { id: goalId, status: "dropped", droppedReason: "Changed course" }, deps);
    expect((await db.goals.get(goalId))!.status).toBe("active");
    const find = async (summary: string) => (await db.aiActions.toArray()).find((x) => x.summary === summary)!;
    expect((await find("Drop goal “Old plan”")).status).toBe("proposed");

    for (let n = 1; n <= BULK_LIMIT + 1; n++) await runCoachTool("create_task", { title: `Step ${n}` }, deps);
    expect(await db.tasks.count()).toBe(BULK_LIMIT);
    expect((await find(`Create task “Step ${BULK_LIMIT}”`)).status).toBe("applied");
    expect((await find(`Create task “Step ${BULK_LIMIT + 1}”`)).status).toBe("proposed");
  });

  it("reminders fire at the local time asked for", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "Africa/Lagos" });
    const out = JSON.parse(
      (await runCoachTool("create_reminder", { title: "Call mum", date: "2026-11-15", time: "17:00" }, deps)).content,
    );
    expect((await db.reminders.get(out.id))!).toMatchObject({
      kind: "custom",
      status: "pending",
      fireAt: Date.UTC(2026, 10, 15, 16),
    });
    expect(instantAt("2026-07-01", "09:30", "Europe/London")).toBe(Date.UTC(2026, 6, 1, 8, 30));
  });

  it("the coach can't delete anything", async () => {
    const { engine } = setup();
    const rec = recordingEngine(engine);
    await expect(rec.engine.remove("tasks", "t".repeat(12))).rejects.toThrow(/can't delete/);
  });
});
