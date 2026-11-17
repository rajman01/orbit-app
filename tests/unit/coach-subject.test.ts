import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { condensePlan, SUMMARY_MARK, transcript, withSummary, type StoredMessage } from "@/features/coach/condense";
import { coachContext, requestMessages } from "@/features/coach/device";
import { CHECKIN_MARK } from "@/features/coach/protocol";
import { subjectHref, subjectOf, subjectThreadId } from "@/features/coach/subject";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

const USER = "user0000000001";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 17, 9));
});
afterEach(() => vi.useRealTimers());

function setup() {
  const db = openLocalDb(`subject-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
  return { db, actions: createActions(engine, USER) };
}

describe("a conversation about one item (3H)", () => {
  it("has one fixed id per item, found again rather than made twice", async () => {
    const { db, actions } = setup();
    const goalId = await actions.createGoal({ title: "Run a half marathon" });
    const subject = { kind: "goal" as const, id: goalId };
    expect(subjectThreadId(subject)).toBe(`csg${goalId}`);
    expect(subjectThreadId({ kind: "task", id: "x".repeat(40) })).toHaveLength(40);
    expect(subjectHref(subject)).toBe(`/goal?id=${goalId}`);
    expect(subjectHref({ kind: "task", id: goalId })).toBeNull();

    const id = await actions.openSubjectThread(subject, "Run a half marathon");
    expect(await actions.openSubjectThread(subject, "Run a half marathon")).toBe(id);
    expect(await db.aiThreads.count()).toBe(1);
    const thread = await db.aiThreads.get(id);
    expect(thread && subjectOf(thread)).toEqual(subject);

    // Archived, or the item renamed: opening it again brings it back under the new name.
    await actions.archiveCoachThread(id);
    await actions.openSubjectThread(subject, "Run a sub-2 half marathon");
    expect(await db.aiThreads.get(id)).toMatchObject({ archivedAt: null, title: "Run a sub-2 half marathon" });
  });

  it("sends the item's current details and what to focus on with every message", async () => {
    const { db, actions } = setup();
    const goalId = await actions.createGoal({ title: "Run a half marathon" });
    await actions.createTask({ title: "Buy running shoes", goalId, status: "todo" });
    const taskId = await actions.createTask({ title: "Book a physio check", status: "todo" });
    const leadId = await actions.createJobLead({ company: "Monzo", role: "Backend engineer", nextStep: "Email Sam" });
    const courseId = await actions.createLearningItem({ title: "Designing Data-Intensive Apps", kind: "book" });
    const now = Date.now();

    const goal = await coachContext(db, USER, now, { kind: "goal", id: goalId });
    expect(goal).toContain(`This conversation is about one goal: “Run a half marathon” (id ${goalId})`);
    expect(goal).toContain("Buy running shoes");
    expect(goal).toContain(`goalId ${goalId}`);

    const task = await coachContext(db, USER, now, { kind: "task", id: taskId });
    expect(task).toContain("one task: “Book a physio check”");
    expect(task).toContain(`break_down_task (id ${taskId})`);

    const job = await coachContext(db, USER, now, { kind: "job", id: leadId });
    expect(job).toContain("one job: “Backend engineer at Monzo”");
    expect(job).toContain("Email Sam");
    expect(job).toContain("Prepare application");

    const course = await coachContext(db, USER, now, { kind: "course", id: courseId });
    expect(course).toContain("one course: “Designing Data-Intensive Apps”");
    expect(course).toContain("Not planned yet.");

    // An ordinary conversation has no focus; a deleted item is said to be gone.
    expect(await coachContext(db, USER, now)).not.toContain("This conversation");
    await actions.deleteJobLead(leadId);
    expect(await coachContext(db, USER, now, { kind: "job", id: leadId })).toContain("has since been deleted");
  });
});

describe("condensing a long conversation (3H)", () => {
  const user = (seq: number, text = `question ${seq}`): StoredMessage => ({
    seq,
    role: "user",
    content: [{ type: "text", text }],
  });
  const system = (seq: number): StoredMessage => ({ seq, role: "system", content: [{ type: "text", text: "ctx" }] });
  const reply = (seq: number): StoredMessage => ({
    seq,
    role: "assistant",
    content: [{ type: "text", text: `answer ${seq}` }],
  });
  const toolUse = (seq: number): StoredMessage => ({
    seq,
    role: "assistant",
    content: [{ type: "tool_use", id: `t${seq}`, name: "get_goal", input: { id: "g1" } }],
  });
  const toolResult = (seq: number): StoredMessage => ({
    seq,
    role: "user",
    content: [{ type: "tool_result", tool_use_id: `t${seq - 1}`, content: "{}" }],
  });
  // 30 exchanges of user, context, a lookup, its result and a reply: 150 messages.
  const rows: StoredMessage[] = Array.from({ length: 30 }, (_, i) => [
    user(i * 5),
    system(i * 5 + 1),
    toolUse(i * 5 + 2),
    toolResult(i * 5 + 3),
    reply(i * 5 + 4),
  ]).flat();

  it("leaves short conversations alone", () => {
    expect(condensePlan(rows.slice(0, 50), null)).toBeNull();
  });

  it("cuts just before a message the user typed, keeping the newest as they are", () => {
    const plan = condensePlan(rows, null, { messages: 120, bytes: 1e9 }, 40)!;
    expect(plan.upToSeq).toBe(109); // the 22nd exchange ends at 109; the 23rd starts with question 110
    expect(plan.summarise).toHaveLength(110);
    const sent = withSummary(rows, { text: "They're training for a half.", upToSeq: plan.upToSeq });
    expect(sent[0].content[0].text).toBe(`${SUMMARY_MARK}\nThey're training for a half.`);
    expect(sent[1].content[0].text).toBe("question 110");
    expect(sent).toHaveLength(41);
    // The usual rules still apply: context stays where it belongs.
    expect(requestMessages(sent)).toHaveLength(41);
  });

  it("never cuts at tool results or a check-in's hidden facts, and counts only what's still sent", () => {
    const checkin: StoredMessage = { seq: 0, role: "user", content: [{ type: "text", text: `${CHECKIN_MARK} x` }] };
    const odd = [checkin, ...rows.slice(1)];
    const plan = condensePlan(odd, null, { messages: 10, bytes: 1e9 }, 146)!;
    expect(plan).toBeNull(); // the only candidate before the newest 146 is the check-in
    // Already summarised up to 109: 40 messages left, nothing to do.
    expect(condensePlan(rows, { text: "s", upToSeq: 109 })).toBeNull();
  });

  it("writes what was said and changed as a transcript, without context or tool results", () => {
    const t = transcript([
      { role: "user", content: [{ type: "text", text: `${SUMMARY_MARK}\nEarlier stuff` }] },
      ...rows.slice(0, 5),
    ]);
    expect(t).toBe(
      'Earlier summary: Earlier stuff\nUser: question 0\n(Coach used get_goal {"id":"g1"})\nCoach: answer 4',
    );
    expect(transcript(rows, 50).length).toBe(50);
  });
});
