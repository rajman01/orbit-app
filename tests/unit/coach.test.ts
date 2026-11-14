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

describe("planning with the coach (2A.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 14, 9));
  });
  afterEach(() => vi.useRealTimers());

  const plan = {
    goal: { title: "Land a senior engineering role", targetDate: "2027-05-01" },
    keyResults: [{ title: "Interviews done", type: "number" as const, target: 10 }],
    milestones: [
      {
        title: "CV and portfolio ready",
        tasks: [
          { title: "List my top 5 projects", effort: 2 as const },
          { title: "Rewrite the CV summary", effort: 1 as const },
        ],
      },
      { title: "Applications out" },
    ],
    tasks: [{ title: "Tell two friends I'm looking" }],
  };

  it("a plan is always previewed, applied as edited, and undone in one go", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" }); // Act and tell me
    const out = await runCoachTool("propose_plan", plan, deps);
    expect(out.content).toMatch(/plan preview/);
    expect(await db.goals.count()).toBe(0);
    const proposal = (await db.aiActions.toArray())[0];
    expect(proposal).toMatchObject({
      status: "proposed",
      summary: "Plan for “Land a senior engineering role”: 2 milestones, 3 tasks",
    });

    // The user renames the goal and drops a task before applying.
    const edited = structuredClone(plan) as typeof plan;
    edited.goal.title = "Senior engineer by May";
    edited.milestones[0].tasks!.splice(1, 1);
    await acceptProposal(proposal.id, deps, edited);

    const goals = await db.goals.toArray();
    expect(goals.map((g) => g.title)).toEqual(["Senior engineer by May"]);
    const milestones = await db.milestones.toArray();
    expect(milestones.map((m) => m.title).sort()).toEqual(["Applications out", "CV and portfolio ready"]);
    const tasks = await db.tasks.toArray();
    expect(tasks.map((t) => t.title).sort()).toEqual(["List my top 5 projects", "Tell two friends I'm looking"]);
    const cvMilestone = milestones.find((m) => m.title === "CV and portfolio ready")!;
    expect(tasks.find((t) => t.title === "List my top 5 projects")).toMatchObject({
      goalId: goals[0].id,
      milestoneId: cvMilestone.id,
      createdBy: "ai",
    });
    expect(await db.keyResults.count()).toBe(1);
    const applied = (await db.aiActions.get(proposal.id))!;
    expect(applied).toMatchObject({
      status: "applied",
      summary: "Plan for “Senior engineer by May”: 2 milestones, 2 tasks",
    });

    await undoAction(engine, proposal.id);
    const alive = async (t: "goals" | "milestones" | "tasks" | "keyResults") =>
      (await db.table(t).toArray()).filter((d: { deletedAt: number | null }) => d.deletedAt == null).length;
    expect([await alive("goals"), await alive("milestones"), await alive("tasks"), await alive("keyResults")]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("an edited plan with an empty title is refused", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    await runCoachTool("propose_plan", plan, deps);
    const proposal = (await db.aiActions.toArray())[0];
    const bad = structuredClone(plan);
    bad.goal.title = "  ";
    await expect(acceptProposal(proposal.id, deps, bad)).rejects.toThrow(/isn't valid/);
    expect(await db.goals.count()).toBe(0);
  });

  it("breaks a task into steps with a next step", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createTask({ title: "Do my taxes", status: "todo" });
    await runCoachTool(
      "break_down_task",
      {
        id,
        steps: ["Find last year's return", "Download bank statements", "Fill in the form"],
        nextStep: "Search email for 'tax return'",
      },
      deps,
    );
    const subtasks = (await db.tasks.where("parentTaskId").equals(id).toArray()).map((t) => t.title);
    expect(subtasks).toHaveLength(3);
    expect((await db.tasks.get(id))!.nextStep).toBe("Search email for 'tax return'");
  });

  it("plans a cycle from the candidates, within the bulk limit", async () => {
    const { db, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC", onboardingCompletedAt: 1 });
    await actions.ensureCycles("2026-11-14");
    const ids = [];
    for (let n = 0; n < 3; n++)
      ids.push(await actions.createTask({ title: `Cycle task ${n}`, status: "todo", effort: 2 }));
    const view = JSON.parse((await runCoachTool("get_cycle_plan", {}, deps)).content);
    expect(view.candidates.map((t: { id: string }) => t.id).sort()).toEqual([...ids].sort());
    await runCoachTool("plan_cycle", { cycleNumber: view.cycle.number, addTaskIds: ids, theme: "Ship the CV" }, deps);
    const cycle = (await db.cycles.toArray()).find((c) => c.number === view.cycle.number)!;
    expect(cycle.theme).toBe("Ship the CV");
    expect((await db.tasks.bulkGet(ids)).every((t) => t!.cycleId === cycle.id)).toBe(true);

    const many = [];
    for (let n = 0; n < BULK_LIMIT + 1; n++)
      many.push(await actions.createTask({ title: `More ${n}`, status: "todo" }));
    const out = await runCoachTool(
      "plan_cycle",
      { cycleNumber: view.cycle.number, addTaskIds: many },
      { ...deps, turn: { writes: 0 } },
    );
    expect(out.content).toMatch(/^Not done yet/);
  });
});

describe("rituals and capture with the coach (2A.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 14, 9));
  });
  afterEach(() => vi.useRealTimers());

  it("sets today's Must-dos, replacing the old ones, and undo puts them back", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const old = await actions.createTask({ title: "Old must-do", status: "todo" });
    await actions.setMustDo((await db.tasks.get(old))!, "2026-11-14", true);
    const a = await actions.createTask({ title: "Write proposal", status: "todo" });
    const b = await actions.createTask({ title: "Call bank", status: "todo" });
    await runCoachTool("set_must_dos", { taskIds: [a, b] }, deps);
    const mustDos = async () =>
      (await db.tasks.toArray())
        .filter((t) => t.mustDoDate === "2026-11-14")
        .map((t) => t.title)
        .sort();
    expect(await mustDos()).toEqual(["Call bank", "Write proposal"]);
    const action = (await db.aiActions.toArray()).find((x) => x.tool === "set_must_dos")!;
    await undoAction(engine, action.id);
    expect(await mustDos()).toEqual(["Old must-do"]);
  });

  it("completes the Daily Plan with today's Must-dos; undo reopens it so it can be done again", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createTask({ title: "Ship it", status: "todo" });
    await runCoachTool("set_must_dos", { taskIds: [id] }, deps);
    await runCoachTool("complete_ritual", { type: "daily_plan" }, deps);
    const ritual = (await db.rituals.toArray())[0];
    expect(ritual).toMatchObject({ type: "daily_plan", date: "2026-11-14" });
    expect(ritual.completedAt).not.toBeNull();
    expect(ritual.data.mustDos).toEqual([id]);
    expect(totalXp(await db.xpEvents.toArray())).toBe(20);

    const action = (await db.aiActions.toArray()).find((x) => x.tool === "complete_ritual")!;
    await undoAction(engine, action.id);
    expect((await db.rituals.get(ritual.id))!).toMatchObject({ completedAt: null, deletedAt: null });
    expect(totalXp(await db.xpEvents.toArray())).toBe(0);
    await runCoachTool("complete_ritual", { type: "daily_plan" }, deps);
    expect((await db.rituals.get(ritual.id))!.completedAt).not.toBeNull();
  });

  it("the test stand-in for capture splits lines into tasks", async () => {
    process.env.COACH_FAKE = "1";
    const { parseCapture } = await import("@/lib/coach/capture");
    const tasks = await parseCapture({} as never, USER, "- call the landlord\nbook dentist; pay rent", "2026-11-14");
    expect(tasks.map((t) => t.title)).toEqual(["call the landlord", "book dentist", "pay rent"]);
    delete process.env.COACH_FAKE;
  });
});
