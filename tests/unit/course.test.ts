import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import { runCoachTool } from "@/features/coach/device";
import { undoAction } from "@/features/coach/write-tools";
import { coursePace, effortFor, scheduleSections, sectionProgress, sectionsFromText } from "@/features/career/course";
import { totalXp } from "@/features/xp/model";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

const USER = "user0000000001";
// Monday 16 November 2026.
const MON = "2026-11-16";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 16, 9));
});
afterEach(() => vi.useRealTimers());

const sec = (id: string, minutes: number | null = null, doneAt: number | null = null) => ({
  id,
  title: `Part ${id}`,
  minutes,
  doneAt,
  taskId: null,
});

describe("planning a course (CAR-6)", () => {
  it("fills study days in order up to the daily limit", () => {
    const s = scheduleSections([sec("a", 30), sec("b", 30), sec("c", 45), sec("d", 90), sec("e"), sec("x", 30, 1)], {
      start: MON,
      targetDate: "2026-11-20",
      days: [1, 2, 3, 4, 5],
      minutesPerDay: 60,
    });
    expect(s.days).toEqual([
      { sectionId: "a", day: "2026-11-16" },
      { sectionId: "b", day: "2026-11-16" },
      { sectionId: "c", day: "2026-11-17" },
      { sectionId: "d", day: "2026-11-18" }, // longer than a day: a day to itself
      { sectionId: "e", day: "2026-11-19" },
    ]);
    expect(s).toMatchObject({ finish: "2026-11-19", late: false, studyDays: 5 });
  });

  it("skips non-study days, and says when it won't fit by the date", () => {
    const s = scheduleSections([sec("a", 60), sec("b", 60), sec("c", 60)], {
      start: "2026-11-20", // a Friday
      targetDate: "2026-11-23",
      days: [1, 2, 3, 4, 5],
      minutesPerDay: 60,
    });
    expect(s.days.map((d) => d.day)).toEqual(["2026-11-20", "2026-11-23", "2026-11-24"]);
    expect(s).toMatchObject({ late: true, finish: "2026-11-24", studyDays: 2 });
  });

  it("sizes, progress, pace and syllabus parsing", () => {
    expect([30, 45, 120, 200, 300].map(effortFor)).toEqual([1, 2, 3, 5, 8]);
    expect(sectionProgress([sec("a", null, 1), sec("b"), sec("c"), sec("d", null, 2)])).toBe(50);
    expect(sectionProgress([])).toBe(0);
    const sections = [
      { ...sec("a", null, 1), taskId: "t1aaaaaaaaaa" },
      { ...sec("b"), taskId: "t2aaaaaaaaaa" },
      { ...sec("c"), taskId: "t3aaaaaaaaaa" },
    ];
    const tasks = [
      { id: "t1aaaaaaaaaa", scheduledDate: "2026-11-16", deletedAt: null },
      { id: "t2aaaaaaaaaa", scheduledDate: "2026-11-17", deletedAt: null },
      { id: "t3aaaaaaaaaa", scheduledDate: "2026-11-20", deletedAt: null },
    ];
    const plan = { targetDate: "2026-11-27", days: [1, 2, 3, 4, 5], minutesPerDay: 60, plannedAt: 1 };
    expect(coursePace(sections, tasks, plan, "2026-11-18")).toMatchObject({
      done: 1,
      total: 3,
      due: 2,
      behind: 1,
      nextDay: "2026-11-17",
      daysLeft: 9,
    });
    expect(coursePace(sections, tasks, plan, "2026-11-16").behind).toBe(0);
    expect(
      sectionsFromText(
        "Week 1: Intro to SQL (45 min)\n- Joins — 1.5h\n2. Indexes, 30m\n\nModule 4 - Window functions\n•",
      ),
    ).toEqual([
      { title: "Intro to SQL", minutes: 45 },
      { title: "Joins", minutes: 90 },
      { title: "Indexes", minutes: 30 },
      { title: "Window functions", minutes: null },
    ]);
  });

  it("plans sections into tasks, keeps them in step, re-plans and unplans", async () => {
    const db = openLocalDb(`course-${Math.random().toString(36).slice(2)}`);
    const actions = createActions(new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch), USER);
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createLearningItem({ title: "SQL course", kind: "course" });
    const item = async () => (await db.learningItems.get(id))!;
    await actions.setSections(await item(), [sec("s1", 30), sec("s2", 30), sec("s3", 60)]);
    const schedule = await actions.planCourse(
      await item(),
      { targetDate: "2026-11-20", days: [1, 2, 3, 4, 5], minutesPerDay: 60 },
      MON,
    );
    expect(schedule).toMatchObject({ finish: "2026-11-17", late: false });
    const planned = await item();
    expect(planned.status).toBe("in_progress");
    expect(planned.plan).toMatchObject({ targetDate: "2026-11-20", minutesPerDay: 60 });
    const tasks = await db.tasks.where("learningItemId").equals(id).toArray();
    expect(tasks.map((t) => [t.title, t.scheduledDate, t.effort, t.learningSectionId]).sort()).toEqual([
      ["SQL course: Part s1", "2026-11-16", 1, "s1"],
      ["SQL course: Part s2", "2026-11-16", 1, "s2"],
      ["SQL course: Part s3", "2026-11-17", 2, "s3"],
    ]);

    // Finishing a section's task ticks the section; the course follows.
    const t1 = tasks.find((t) => t.learningSectionId === "s1")!;
    await actions.setTaskDone(t1 as never, true);
    expect((await item()).sections!.find((s) => s.id === "s1")!.doneAt).not.toBeNull();
    expect((await item()).progress).toBe(33);
    // Ticking on the course page goes through the task.
    await actions.toggleSection(await item(), "s2", true);
    expect((await db.tasks.get(tasks.find((t) => t.learningSectionId === "s2")!.id))!.status).toBe("done");

    // Re-planning from a later day moves the open one; no duplicates.
    await actions.planCourse(
      await item(),
      { targetDate: "2026-11-27", days: [1, 2, 3, 4, 5], minutesPerDay: 60 },
      "2026-11-19",
    );
    const after = (await db.tasks.where("learningItemId").equals(id).toArray()).filter((t) => !t.deletedAt);
    expect(after).toHaveLength(3);
    expect(after.find((t) => t.learningSectionId === "s3")!.scheduledDate).toBe("2026-11-19");

    // The last section finishes the course, with its XP.
    const before = totalXp(await db.xpEvents.toArray());
    await actions.toggleSection(await item(), "s3", true);
    expect(await item()).toMatchObject({ status: "done", progress: 100 });
    expect(totalXp(await db.xpEvents.toArray()) - before).toBeGreaterThanOrEqual(30);

    // Unplanning keeps what's done and removes open tasks.
    await actions.toggleSection(await item(), "s3", false);
    await actions.unplanCourse(await item());
    expect((await item()).plan).toBeNull();
    const left = (await db.tasks.where("learningItemId").equals(id).toArray()).filter((t) => !t.deletedAt);
    expect(left.map((t) => t.learningSectionId).sort()).toEqual(["s1", "s2"]);
  });

  it("the coach can split a course into sections and plan it, and undo it all", async () => {
    const db = openLocalDb(`course-${Math.random().toString(36).slice(2)}`);
    const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
    const actions = createActions(engine, USER);
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createLearningItem({ title: "Designing Data-Intensive Applications", kind: "book" });
    const deps = { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } };
    const out = await runCoachTool(
      "plan_course",
      {
        learningItemId: id,
        targetDate: "2026-11-27",
        minutesPerDay: 60,
        sections: [{ title: "Reliability", minutes: 60 }, { title: "Storage", minutes: 60 }, { title: "Replication" }],
      },
      deps,
    );
    expect(JSON.parse(out.content)).toMatchObject({ id, planned: 3, finish: "2026-11-18", late: false });
    const item = (await db.learningItems.get(id))!;
    expect(item.sections!.map((s) => [s.title, s.minutes])).toEqual([
      ["Reliability", 60],
      ["Storage", 60],
      ["Replication", null],
    ]);
    expect(item.plan).toMatchObject({ targetDate: "2026-11-27", days: [1, 2, 3, 4, 5] });
    expect((await db.tasks.where("learningItemId").equals(id).toArray()).filter((t) => !t.deletedAt)).toHaveLength(3);
    const [action] = await db.aiActions.toArray();
    await undoAction(engine, action.id);
    expect((await db.learningItems.get(id))!.plan ?? null).toBeNull();
    expect((await db.tasks.where("learningItemId").equals(id).toArray()).filter((t) => !t.deletedAt)).toHaveLength(0);
  });
});
