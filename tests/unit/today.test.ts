import { describe, expect, it } from "vitest";
import {
  addMinutes,
  changePlan,
  elapsedMs,
  formatClock,
  isTimeUp,
  keepGoing,
  parseFocusState,
  pause,
  remainingMs,
  resume,
  startBreak,
  startFocus,
  workedMinutes,
} from "@/features/focus/model";
import { newTaskFields, type Task } from "@/features/tasks/model";
import {
  buildToday,
  buildUpcoming,
  isSkip,
  isStale,
  needsNextStepPrompt,
  orderBetween,
  planDay,
} from "@/features/today/model";
import { dayOf } from "@/lib/dates";

const DAY = 86_400_000;
const today = "2026-11-12";
const now = Date.UTC(2026, 10, 12, 12); // noon UTC on the 12th
const opts = { today, now, timezone: "UTC", capacity: 8 };

let n = 0;
const task = (p: Partial<Task>): Task =>
  ({
    id: `t${++n}`,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    serverVersion: 0,
    ...newTaskFields({ title: `task ${n}`, status: "todo", order: n }),
    ...p,
  }) as Task;

describe("today sections", () => {
  it("splits Must-dos, Also today, overdue and done", () => {
    const must = task({ scheduledDate: today, mustDoDate: today, effort: 3 });
    const also = task({ dueDate: today, effort: 2 });
    const undatedInProgress = task({ status: "in_progress" });
    const laterInProgress = task({ status: "in_progress", scheduledDate: "2026-11-13" });
    const late = task({ scheduledDate: "2026-11-10" });
    const done = task({ status: "done", completedAt: now - 1000, scheduledDate: today, effort: 1 });
    const tomorrow = task({ scheduledDate: "2026-11-13" });
    const sub = task({ scheduledDate: today, parentTaskId: must.id });
    const plan = buildToday([must, also, undatedInProgress, laterInProgress, late, done, tomorrow, sub], opts);

    expect(plan.mustDos.map((t) => t.id)).toEqual([must.id]);
    expect(plan.also.map((t) => t.id)).toEqual([also.id, undatedInProgress.id]);
    expect(plan.overdue.map((t) => t.id)).toEqual([late.id]);
    expect(plan.doneToday.map((t) => t.id)).toEqual([done.id]);
    expect(plan.capacity).toMatchObject({ planned: 6, done: 1, capacity: 8, unestimated: 1, over: 0 });
  });

  it("scheduled date wins over due date, so a planned-for-today task with a missed deadline is not overdue", () => {
    const t = task({ dueDate: "2026-11-01", scheduledDate: today });
    expect(planDay(t)).toBe(today);
    const plan = buildToday([t], opts);
    expect(plan.also).toHaveLength(1);
    expect(plan.overdue).toHaveLength(0);
  });

  it("an unfinished Must-do from yesterday is not a Must-do today; it needs a decision", () => {
    const t = task({ scheduledDate: "2026-11-11", mustDoDate: "2026-11-11" });
    const plan = buildToday([t], opts);
    expect(plan.mustDos).toHaveLength(0);
    expect(plan.overdue.map((x) => x.id)).toEqual([t.id]);
  });

  it("flags capacity overruns", () => {
    const plan = buildToday(
      [task({ scheduledDate: today, effort: 8 }), task({ scheduledDate: today, effort: 3 })],
      opts,
    );
    expect(plan.capacity.over).toBe(3);
  });

  it("uses the user's timezone for 'done today'", () => {
    // 23:30 UTC on the 11th is already the 12th in Lagos (UTC+1).
    const completedAt = Date.UTC(2026, 10, 11, 23, 30);
    const t = task({ status: "done", completedAt });
    expect(dayOf(completedAt, "Africa/Lagos")).toBe(today);
    expect(buildToday([t], { ...opts, timezone: "Africa/Lagos" }).doneToday).toHaveLength(1);
    expect(buildToday([t], opts).doneToday).toHaveLength(0);
  });
});

describe("stale tasks", () => {
  it("is stale after 3 postpones", () => {
    expect(isStale(task({ postponeCount: 2, scheduledDate: "2026-11-20" }), today, now)).toBe(false);
    expect(isStale(task({ postponeCount: 3, scheduledDate: "2026-11-20" }), today, now)).toBe(true);
  });

  it("is stale when planned and untouched for 14 days", () => {
    const old = now - 14 * DAY;
    expect(isStale(task({ scheduledDate: "2026-10-20", updatedAt: old }), today, now)).toBe(true);
    expect(isStale(task({ status: "in_progress", updatedAt: old }), today, now)).toBe(true);
    // Planned for the future, or recently touched: not stale.
    expect(isStale(task({ scheduledDate: "2026-12-01", updatedAt: old }), today, now)).toBe(false);
    expect(isStale(task({ scheduledDate: "2026-10-20", updatedAt: now - 13 * DAY }), today, now)).toBe(false);
    // Unplanned backlog and inbox items never go stale; neither do closed tasks.
    expect(isStale(task({ status: "backlog", updatedAt: old }), today, now)).toBe(false);
    expect(isStale(task({ status: "inbox", postponeCount: 5 }), today, now)).toBe(false);
    expect(isStale(task({ status: "done", postponeCount: 5 }), today, now)).toBe(false);
  });

  it("stale tasks are pinned on their own, not repeated in other sections", () => {
    const t = task({ scheduledDate: "2026-11-10", postponeCount: 3 });
    const plan = buildToday([t], opts);
    expect(plan.stale.map((x) => x.id)).toEqual([t.id]);
    expect(plan.overdue).toHaveLength(0);
  });
});

describe("skip rules", () => {
  it("moving a task planned for today or earlier is a skip", () => {
    expect(isSkip(task({ scheduledDate: today }), today, "2026-11-13")).toBe(true);
    expect(isSkip(task({ scheduledDate: today }), today, null)).toBe(true);
    expect(isSkip(task({ scheduledDate: "2026-11-01" }), today, "2026-11-13")).toBe(true);
    expect(isSkip(task({ mustDoDate: today }), today, "2026-11-13")).toBe(true);
  });

  it("scheduling an unplanned or future task is not a skip", () => {
    expect(isSkip(task({}), today, "2026-11-13")).toBe(false);
    expect(isSkip(task({ scheduledDate: "2026-11-20" }), today, "2026-11-25")).toBe(false);
    expect(isSkip(task({ scheduledDate: today }), today, today)).toBe(false);
  });

  it("asks for a next step only on big tasks without one", () => {
    expect(needsNextStepPrompt(task({ effort: 3 }))).toBe(true);
    expect(needsNextStepPrompt(task({ effort: 2 }))).toBe(false);
    expect(needsNextStepPrompt(task({ effort: 5, nextStep: "Open the doc" }))).toBe(false);
  });
});

describe("ordering and upcoming", () => {
  it("places a moved item between its neighbours", () => {
    expect(orderBetween(10, 20)).toBe(15);
    expect(orderBetween(undefined, 20)).toBeLessThan(20);
    expect(orderBetween(10, undefined)).toBeGreaterThan(10);
  });

  it("groups the next 14 days by plan day", () => {
    const a = task({ scheduledDate: "2026-11-13" });
    const b = task({ dueDate: "2026-11-13" });
    const c = task({ scheduledDate: "2026-11-26" });
    const tooFar = task({ scheduledDate: "2026-11-27" });
    const todays = task({ scheduledDate: today });
    const closed = task({ scheduledDate: "2026-11-13", status: "done" });
    const groups = buildUpcoming([a, b, c, tooFar, todays, closed], today, 14);
    expect(groups.map((g) => [g.day, g.tasks.length])).toEqual([
      ["2026-11-13", 2],
      ["2026-11-26", 1],
    ]);
  });
});

describe("focus timer", () => {
  const MIN = 60_000;
  const t0 = 1_000_000;

  it("counts work time from timestamps and survives a reload", () => {
    const s = startFocus("s1", "t1", "five", 5, t0);
    expect(remainingMs(s, t0 + 2 * MIN)).toBe(3 * MIN);
    const reloaded = parseFocusState(JSON.stringify(s))!;
    expect(remainingMs(reloaded, t0 + 2 * MIN)).toBe(3 * MIN);
    expect(isTimeUp(reloaded, t0 + 5 * MIN)).toBe(true);
    expect(formatClock(remainingMs(s, t0 + 61_000)!)).toBe("03:59");
  });

  it("excludes paused time and counts interruptions", () => {
    let s = startFocus("s1", "t1", "pomodoro", 25, t0);
    s = pause(s, t0 + 5 * MIN);
    expect(elapsedMs(s, t0 + 10 * MIN)).toBe(5 * MIN);
    s = resume(s, t0 + 10 * MIN);
    expect(elapsedMs(s, t0 + 12 * MIN)).toBe(7 * MIN);
    expect(s.interruptions).toBe(1);
  });

  it("+5 minutes, keep going and changing the plan", () => {
    let s = startFocus("s1", "t1", "five", 5, t0);
    s = addMinutes(s, 5, t0 + MIN);
    expect(s.plannedMs).toBe(10 * MIN);
    // Time's up at 10 min; the minute before "Keep going" isn't work time, so the block starts from 10.
    expect(elapsedMs(s, t0 + 11 * MIN)).toBe(10 * MIN);
    s = keepGoing(s, 25, t0 + 11 * MIN);
    expect(s.plannedMs).toBe(35 * MIN);
    expect(s.mode).toBe("pomodoro");
    s = changePlan(s, "open", null, t0 + 12 * MIN);
    expect(remainingMs(s, t0 + 12 * MIN)).toBeNull();
    expect(workedMinutes(s, t0 + 12 * MIN)).toBe(11);
  });

  it("stops counting at Time's up, however long it's left", () => {
    let s = startFocus("s1", "t1", "pomodoro", 25, t0);
    expect(isTimeUp(s, t0 + 25 * MIN)).toBe(true);
    expect(workedMinutes(s, t0 + 8 * 60 * MIN)).toBe(25);
    // +5 min after the overrun gives 5 more minutes from now, not from the start.
    s = addMinutes(s, 5, t0 + 8 * 60 * MIN);
    expect(remainingMs(s, t0 + 8 * 60 * MIN)).toBe(5 * MIN);
    expect(workedMinutes(s, t0 + 8 * 60 * MIN + 2 * MIN)).toBe(27);
    // A break taken after an overrun doesn't count the overrun either.
    s = startBreak(s, 5, t0 + 9 * 60 * MIN);
    expect(workedMinutes(s, t0 + 9 * 60 * MIN)).toBe(30);
    s = keepGoing(s, 25, t0 + 9 * 60 * MIN + 5 * MIN);
    expect(remainingMs(s, t0 + 9 * 60 * MIN + 5 * MIN)).toBe(25 * MIN);
    // Open-ended sessions have no "Time's up", so they keep counting.
    const open = startFocus("s2", "t1", "open", null, t0);
    expect(workedMinutes(open, t0 + 90 * MIN)).toBe(90);
  });

  it("a break pauses work time without counting as an interruption", () => {
    let s = startFocus("s1", "t1", "pomodoro", 25, t0);
    s = startBreak(s, 5, t0 + 25 * MIN);
    expect(s.interruptions).toBe(0);
    expect(elapsedMs(s, t0 + 29 * MIN)).toBe(25 * MIN);
    expect(isTimeUp(s, t0 + 29 * MIN)).toBe(false);
    s = keepGoing(s, 25, t0 + 30 * MIN);
    expect(s.breakEndsAt).toBeNull();
    expect(remainingMs(s, t0 + 30 * MIN)).toBe(25 * MIN);
  });

  it("rejects corrupt stored state", () => {
    expect(parseFocusState("{bad")).toBeNull();
    expect(parseFocusState(JSON.stringify({ v: 2 }))).toBeNull();
    expect(parseFocusState(null)).toBeNull();
  });
});
