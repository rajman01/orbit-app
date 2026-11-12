import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayLabel, dayOf, weekday } from "@/lib/dates";
import { goalProgress, krProgress, needsNextStep, suggestHealth, type KeyResult } from "@/features/goals/model";
import { parseQuickAdd } from "@/features/quick-add/parse";
import { newTaskFields, nextInstanceId, nextOccurrence, type Task } from "@/features/tasks/model";

const task = (p: Partial<Task>): Task =>
  ({
    id: "t",
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    serverVersion: 0,
    ...newTaskFields({ title: "x" }),
    ...p,
  }) as Task;
const kr = (p: Partial<KeyResult>): KeyResult =>
  ({
    id: "k",
    goalId: "g",
    title: "kr",
    type: "number",
    start: 0,
    target: 10,
    current: 0,
    unit: null,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    serverVersion: 0,
    ...p,
  }) as KeyResult;

describe("dates", () => {
  it("uses the user's timezone for the calendar day", () => {
    const instant = Date.UTC(2026, 10, 12, 23, 30); // 23:30 UTC
    expect(dayOf(instant, "UTC")).toBe("2026-11-12");
    expect(dayOf(instant, "Africa/Lagos")).toBe("2026-11-13"); // UTC+1
    expect(dayOf(instant, "America/New_York")).toBe("2026-11-12");
  });
  it("does day maths without DST surprises", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09"); // across US DST change
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(weekday("2026-11-15")).toBe(0); // Sunday
    expect(dayLabel("2026-11-13", "2026-11-12")).toBe("Tomorrow");
  });
});

describe("recurrence", () => {
  it("daily, monthly and after-completion", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1, mode: "fixed" }, "2026-11-12", "2026-11-14")).toBe(
      "2026-11-13",
    );
    expect(nextOccurrence({ freq: "daily", interval: 2, mode: "after_completion" }, "2026-11-12", "2026-11-14")).toBe(
      "2026-11-16",
    );
    expect(nextOccurrence({ freq: "monthly", interval: 1, mode: "fixed" }, "2026-01-31", "2026-01-31")).toBe(
      "2026-02-28",
    );
  });
  it("weekly on specific days", () => {
    const rule = { freq: "weekly" as const, interval: 1, byWeekday: [1, 3], mode: "fixed" as const }; // Mon, Wed
    expect(nextOccurrence(rule, "2026-11-16", "2026-11-16")).toBe("2026-11-18"); // Mon → Wed
    expect(nextOccurrence(rule, "2026-11-18", "2026-11-18")).toBe("2026-11-23"); // Wed → next Mon
    const fortnightly = { ...rule, interval: 2 };
    expect(nextOccurrence(fortnightly, "2026-11-18", "2026-11-18")).toBe("2026-11-30"); // skips a week
  });
  it("gives the next instance a deterministic id", () => {
    expect(nextInstanceId("01ABCDEFGHJKMNPQRSTVWXYZ00", "2026-11-13")).toBe("01ABCDEFGHJKMNPQRSTVWXYZ0020261113");
  });
});

describe("goal progress and health", () => {
  it("averages key results when there are any", () => {
    expect(krProgress(kr({ current: 5 }))).toBe(0.5);
    expect(krProgress(kr({ type: "boolean", current: 1, target: 1 }))).toBe(1);
    expect(goalProgress([kr({ current: 5 }), kr({ current: 10 })], [])).toBe(0.75);
  });
  it("falls back to effort-weighted tasks, ignoring subtasks and cancelled", () => {
    const tasks = [
      task({ status: "done", effort: 3 }),
      task({ status: "todo", effort: 1 }),
      task({ status: "cancelled", effort: 8 }),
      task({ status: "todo", effort: 8, parentTaskId: "p" }),
    ];
    expect(goalProgress([], tasks)).toBe(0.75);
  });
  it("suggests health from progress vs. time", () => {
    const goal = { startDate: "2026-01-01", targetDate: "2026-12-31", createdAt: 0 };
    expect(suggestHealth(goal, 0.5, "2026-07-01", "2026-01-01")).toBe("on_track");
    expect(suggestHealth(goal, 0.3, "2026-07-01", "2026-01-01")).toBe("at_risk");
    expect(suggestHealth(goal, 0.1, "2026-07-01", "2026-01-01")).toBe("off_track");
  });
  it("flags active goals without an open task", () => {
    expect(needsNextStep({ status: "active" }, [task({ status: "done" })])).toBe(true);
    expect(needsNextStep({ status: "active" }, [task({ status: "todo" })])).toBe(false);
    expect(needsNextStep({ status: "paused" }, [])).toBe(false);
  });
});

describe("quick add parsing", () => {
  const ctx = {
    areas: [
      { id: "a1", name: "Career" },
      { id: "a2", name: "Finance" },
    ],
    goals: [{ id: "g1", title: "Land a senior role" }],
    timezone: "UTC",
    now: new Date(Date.UTC(2026, 10, 12, 10)), // Thu 12 Nov 2026
  };
  it("pulls out date, priority, area and goal", () => {
    const r = parseQuickAdd("Send CV tomorrow !2 #car +senior", ctx);
    expect(r).toMatchObject({ title: "Send CV", dueDate: "2026-11-13", priority: "high", areaId: "a1", goalId: "g1" });
    expect(r.tokens.map((t) => t.kind).sort()).toEqual(["area", "date", "goal", "priority"]);
  });
  it("matches a goal by any word", () => {
    expect(parseQuickAdd("Prep +role", ctx).goalId).toBe("g1");
  });
  it("understands weekdays and leaves month names alone", () => {
    expect(parseQuickAdd("Call mum friday", ctx)).toMatchObject({ title: "Call mum", dueDate: "2026-11-13" });
    expect(parseQuickAdd("Review budget for November", ctx)).toMatchObject({
      title: "Review budget for November",
      dueDate: null,
    });
  });
  it("keeps unknown tags in the title", () => {
    expect(parseQuickAdd("Buy #milk", ctx)).toMatchObject({ title: "Buy #milk", areaId: null });
  });
});
