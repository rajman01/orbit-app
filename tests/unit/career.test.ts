import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActions } from "@/features/actions";
import {
  dueNextSteps,
  learningPatch,
  newLeadFields,
  newLearningFields,
  newSkillFields,
  pipelineStats,
  skillsByCategory,
  stagePatch,
} from "@/features/career/model";
import { runCoachTool } from "@/features/coach/device";
import { undoAction } from "@/features/coach/write-tools";
import { dueNotifications, notificationMeta } from "@/features/reminders/model";
import { totalXp, xpEventId } from "@/features/xp/model";
import { openLocalDb } from "@/lib/local-db/db";
import { SyncEngine } from "@/lib/sync/engine";

const USER = "user0000000001";
const NOW = Date.UTC(2026, 10, 16, 9);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function setup() {
  const db = openLocalDb(`career-${Math.random().toString(36).slice(2)}`);
  const engine = new SyncEngine(db, (() => new Promise<Response>(() => {})) as typeof fetch);
  const actions = createActions(engine, USER);
  return { db, engine, actions, deps: { engine, db, actions, userId: USER, now: Date.now(), turn: { writes: 0 } } };
}

describe("skills (CAR-2)", () => {
  it("default to aiming one level up, and group by category", () => {
    expect(newSkillFields({ name: " SQL " })).toMatchObject({ name: "SQL", level: 1, targetLevel: 2, category: "" });
    expect(newSkillFields({ name: "Go", level: 4, targetLevel: 2 }).targetLevel).toBe(4);
    const groups = skillsByCategory([
      { category: "", order: 1 },
      { category: "Design", order: 3 },
      { category: "Data", order: 2 },
      { category: "Design", order: 1 },
    ]);
    expect(groups.map((g) => [g.category, g.items.map((i) => i.order)])).toEqual([
      ["Data", [2]],
      ["Design", [1, 3]],
      ["", [1]],
    ]);
  });

  it("levelling up earns 50 XP a level; lowering takes it back", async () => {
    const { db, actions } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const id = await actions.createSkill({ name: "Figma", level: 2, targetLevel: 3 });
    const skill = async () => (await db.skills.get(id))!;
    await actions.updateSkill(await skill(), { level: 4 });
    expect(await skill()).toMatchObject({ level: 4, targetLevel: 4 }); // the target follows
    expect(totalXp(await db.xpEvents.toArray())).toBe(100);
    await actions.updateSkill(await skill(), { level: 3 });
    expect(totalXp(await db.xpEvents.toArray())).toBe(50);
    await actions.updateSkill(await skill(), { level: 4 });
    expect(totalXp(await db.xpEvents.toArray())).toBe(100);
    expect(await db.xpEvents.get(xpEventId("skill", `${id}4`))).toMatchObject({ reason: "Figma: Skilled" });

    // Deleting a skill keeps its learning and tasks, unlinked.
    const item = await actions.createLearningItem({ title: "Refactoring UI", skillId: id });
    const task = await actions.createTask({ title: "Redesign the portfolio", skillId: id });
    await actions.deleteSkill(id);
    expect((await db.learningItems.get(item))!.skillId).toBeNull();
    expect((await db.tasks.get(task))!.skillId).toBeNull();
  });
});

describe("learning (CAR-3)", () => {
  const base = { status: "queued" as const, progress: 0, startedAt: null, finishedAt: null };

  it("status and progress move together", () => {
    expect(learningPatch(base, { status: "in_progress" }, 5)).toEqual({ status: "in_progress", startedAt: 5 });
    expect(learningPatch(base, { progress: 40 }, 5)).toEqual({ status: "in_progress", progress: 40, startedAt: 5 });
    const started = { status: "in_progress" as const, progress: 40, startedAt: 5, finishedAt: null };
    expect(learningPatch(started, { progress: 100 }, 9)).toEqual({ status: "done", progress: 100, finishedAt: 9 });
    expect(learningPatch(started, { status: "done" }, 9)).toEqual({ status: "done", progress: 100, finishedAt: 9 });
    const done = { status: "done" as const, progress: 100, startedAt: 5, finishedAt: 9 };
    expect(learningPatch(done, { progress: 80 }, 10)).toEqual({
      status: "in_progress",
      progress: 80,
      finishedAt: null,
    });
    expect(learningPatch(done, { status: "queued" }, 10)).toEqual({
      status: "queued",
      progress: 0,
      startedAt: null,
      finishedAt: null,
    });
    expect(newLearningFields({ title: "A", progress: 30 })).toMatchObject({ status: "in_progress", progress: 30 });
  });

  it("finishing earns XP (more for books and courses), reopening takes it back", async () => {
    const { db, actions } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const book = await actions.createLearningItem({ title: "Deep Work", kind: "book" });
    const article = await actions.createLearningItem({ title: "On writing", kind: "article" });
    await actions.updateLearningItem((await db.learningItems.get(book))!, { status: "done" });
    await actions.updateLearningItem((await db.learningItems.get(article))!, { progress: 100 });
    expect(totalXp(await db.xpEvents.toArray())).toBe(40);
    await actions.updateLearningItem((await db.learningItems.get(book))!, { status: "in_progress" });
    expect(totalXp(await db.xpEvents.toArray())).toBe(10);
  });
});

describe("job search (CAR-4)", () => {
  it("keeps applied, interviewed and closed times as a lead moves", () => {
    const lead = newLeadFields({ company: " Acme ", role: "Designer" }, 1);
    expect(lead).toMatchObject({ company: "Acme", stage: "researching", appliedAt: null, closedAt: null });
    const applied = { ...lead, ...stagePatch(lead, "applied", null, 2) };
    expect(applied).toMatchObject({ stage: "applied", appliedAt: 2 });
    const interviewing = { ...applied, ...stagePatch(applied, "interviewing", null, 3) };
    expect(interviewing).toMatchObject({ appliedAt: 2, interviewedAt: 3 });
    const closed = { ...interviewing, ...stagePatch(interviewing, "closed", "rejected", 4) };
    expect(closed).toMatchObject({ stage: "closed", outcome: "rejected", closedAt: 4, interviewedAt: 3 });
    // Reopening clears the end; a lead closed without applying was withdrawn.
    expect(stagePatch(closed, "offer", null, 5)).toEqual({ stage: "offer", outcome: null, closedAt: null });
    expect(stagePatch(lead, "closed", null, 6)).toMatchObject({ outcome: "withdrawn", closedAt: 6 });
    expect(stagePatch(applied, "closed", null, 6)).toMatchObject({ outcome: "no_reply" });
  });

  it("works out rates and next steps due", () => {
    const l = (p: Record<string, unknown>) =>
      ({
        stage: "applied",
        appliedAt: 1,
        interviewedAt: null,
        outcome: null,
        deletedAt: null,
        nextStep: "",
        nextDate: null,
        ...p,
      }) as never;
    const leads = [
      l({ stage: "researching", appliedAt: null }),
      l({}),
      l({ stage: "interviewing", interviewedAt: 2, nextStep: "Prep", nextDate: "2026-11-16" }),
      l({ stage: "closed", outcome: "rejected", interviewedAt: 2 }),
      l({ stage: "closed", outcome: "accepted", interviewedAt: 2 }),
      l({ stage: "offer", interviewedAt: 2, nextStep: "Decide", nextDate: "2026-11-14" }),
    ];
    const s = pipelineStats(leads);
    expect(s.applied).toBe(5);
    expect(s.interviewRate).toBeCloseTo(4 / 5);
    expect(s.offerRate).toBeCloseTo(2 / 5);
    expect(s.open).toMatchObject({ researching: 1, applied: 1, interviewing: 1, offer: 1, closed: 2 });
    expect(dueNextSteps(leads, "2026-11-16").map((x: { nextStep: string }) => x.nextStep)).toEqual(["Decide", "Prep"]);
  });

  it("a lead's next step is pushed at Daily Plan time on its day", () => {
    const at = (t: string) => Date.parse(`2026-11-16T${t}:00Z`);
    const base = {
      settings: { timezone: "UTC" },
      rituals: [],
      cycles: [],
      habits: [],
      habitLogs: [],
      reminders: [],
      dueTodayCount: 0,
      sent: new Set<string>(),
      jobLeads: [
        {
          id: "lead00000001",
          company: "Acme",
          role: "Designer",
          stage: "applied" as const,
          nextStep: "Follow up",
          nextDate: "2026-11-16",
        },
        {
          id: "lead00000002",
          company: "Old",
          role: "",
          stage: "closed" as const,
          nextStep: "x",
          nextDate: "2026-11-16",
        },
        {
          id: "lead00000003",
          company: "Later",
          role: "",
          stage: "applied" as const,
          nextStep: "x",
          nextDate: "2026-11-17",
        },
      ],
    };
    const jobs = dueNotifications({ ...base, now: at("07:35") }).filter((n) => n.key.startsWith("job:"));
    expect(jobs).toEqual([
      {
        key: "job:lead00000001:2026-11-16",
        title: "Acme: Follow up",
        body: "Designer · today",
        url: "/jobs",
        tag: "orbit-job-lead00000001",
      },
    ]);
    expect(notificationMeta(jobs[0].key)).toEqual({ kind: "job", ref: "lead00000001" });
    expect(
      dueNotifications({
        ...base,
        now: at("07:35"),
        settings: {
          timezone: "UTC",
          notify: { plan: true, shutdown: true, review: true, habits: true, focus: true, jobs: false },
        },
      }).filter((n) => n.key.startsWith("job:")),
    ).toEqual([]);
  });
});

describe("coach career tools", () => {
  it("reads and saves skills, learning and leads, with undo", async () => {
    const { db, engine, actions, deps } = setup();
    await actions.saveSettings({ timezone: "UTC" });
    const skill = JSON.parse(
      (await runCoachTool("save_skill", { name: "Interviewing", level: 2, targetLevel: 4 }, deps)).content,
    ).id;
    await runCoachTool(
      "save_learning_item",
      { title: "Cracking the PM Interview", kind: "book", skillId: skill },
      deps,
    );
    const lead = JSON.parse(
      (
        await runCoachTool(
          "save_job_lead",
          { company: "Acme", role: "PM", stage: "applied", nextStep: "Follow up", nextDate: "2026-11-15" },
          deps,
        )
      ).content,
    ).id;
    expect(await db.jobLeads.get(lead)).toMatchObject({ stage: "applied", appliedAt: NOW });

    const out = JSON.parse((await runCoachTool("get_career", {}, deps)).content);
    expect(out.skills).toMatchObject([{ name: "Interviewing", level: "2 Beginner", target: "4 Skilled" }]);
    expect(out.learning).toMatchObject([
      { title: "Cracking the PM Interview", status: "queued", skill: "Interviewing" },
    ]);
    expect(out.jobSearch).toMatchObject({
      applied: 1,
      leads: [{ company: "Acme", nextStep: "Follow up", overdue: true }],
    });

    await runCoachTool(
      "save_job_lead",
      { id: lead, stage: "interviewing", nextStep: "Prep case study", nextDate: "2026-11-18" },
      deps,
    );
    expect(await db.jobLeads.get(lead)).toMatchObject({
      stage: "interviewing",
      interviewedAt: NOW,
      nextStep: "Prep case study",
    });
    const moved = (await db.aiActions.toArray()).find(
      (a) => a.tool === "save_job_lead" && a.summary.startsWith("Move"),
    )!;
    expect(moved.summary).toBe("Move “Acme” to interviewing");
    await undoAction(engine, moved.id);
    expect(await db.jobLeads.get(lead)).toMatchObject({ stage: "applied", interviewedAt: null, nextStep: "Follow up" });

    const err = await runCoachTool("save_skill", { id: "nosuchskill0001", level: 3 }, deps);
    expect(err.isError).toBe(true);
  });
});
