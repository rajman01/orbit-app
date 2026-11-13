import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { coachContext, requestMessages, runCoachTool } from "@/features/coach/device";
import { coachRequestSchema, type CoachEvent, type CoachMessage } from "@/features/coach/protocol";
import { COACH_TOOLS, toolDefinitions } from "@/features/coach/tools";
import { fakeCoachTurn } from "@/lib/coach/fake";
import { openLocalDb } from "@/lib/local-db/db";
import { entitySchemas } from "@/lib/sync/entities";
import { SyncEngine } from "@/lib/sync/engine";

vi.mock("server-only", () => ({}));

const USER = "user0000000001";

function setup() {
  const db = openLocalDb(`coach-${Math.random().toString(36).slice(2)}`);
  const actions = createActions(new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch), USER);
  return { db, actions, deps: { db, actions, userId: USER, now: Date.now() } };
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
