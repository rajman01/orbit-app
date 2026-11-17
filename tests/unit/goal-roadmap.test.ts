import { describe, expect, it } from "vitest";
import type { Milestone } from "@/features/goals/model";
import { buildRoadmap, dayAt } from "@/features/goals/roadmap";
import type { Task } from "@/features/tasks/model";

const ms = (id: string, title: string, dueDate: string | null, done = false, order = 0) =>
  ({ id, title, dueDate, doneAt: done ? 1 : null, order, goalId: "g", deletedAt: null }) as unknown as Milestone;
const task = (id: string, milestoneId: string, status: "todo" | "done" | "cancelled") =>
  ({ id, milestoneId, status, deletedAt: null, parentTaskId: null }) as unknown as Task;

describe("a goal's roadmap (GOAL-10)", () => {
  const goal = { startDate: "2026-10-01", targetDate: "2028-08-01" };
  const milestones = [
    ms("m1", "Research visa routes", "2026-10-20", true),
    ms("m3", "Credential assessment", "2027-05-01"),
    ms("m2", "IELTS exam", "2027-02-01"),
    ms("m4", "Save $15k", null),
  ];

  it("places dated milestones in date order along the path from start to target", () => {
    const road = buildRoadmap(goal, milestones, [], "2026-11-17", "2026-10-05")!;
    expect(road.start).toBe("2026-10-01");
    expect(road.end).toBe("2028-08-01");
    expect(road.hasTarget).toBe(true);
    expect(road.stops.map((s) => s.milestone.title)).toEqual([
      "Research visa routes",
      "IELTS exam",
      "Credential assessment",
    ]);
    expect(road.stops[1].at).toBeCloseTo(123 / 670, 3);
    expect(road.undated.map((m) => m.title)).toEqual(["Save $15k"]);
    expect(road.today).toBeGreaterThan(0);
    expect(road.pastEnd).toBe(false);
    // A path of almost two years is marked in years.
    expect(road.ticks.map((t) => t.label)).toEqual(["2027", "2028"]);
  });

  it("marks done, the one up next, the later ones, and those overdue or behind pace", () => {
    const tasks = [
      task("t1", "m2", "done"),
      task("t2", "m2", "todo"),
      task("t3", "m3", "todo"),
      task("t4", "m3", "todo"),
      task("t5", "m3", "cancelled"),
    ];
    const road = buildRoadmap(goal, milestones, tasks, "2026-11-17", "2026-10-05")!;
    expect(road.stops.map((s) => s.state)).toEqual(["done", "current", "upcoming"]);
    expect(road.stops[1]).toMatchObject({ done: 1, total: 2 });
    expect(road.stops[1].next?.id).toBe("t2");
    expect(road.stops[2]).toMatchObject({ done: 0, total: 2 });

    // In April 2027 the IELTS date has passed, and the assessment is close with nothing done.
    const later = buildRoadmap(goal, milestones, tasks, "2027-04-20", "2026-10-05")!;
    expect(later.stops.map((s) => [s.state, s.behind])).toEqual([
      ["done", null],
      ["behind", "overdue"],
      ["behind", "pace"],
    ]);
  });

  it("needs a target date or a dated milestone, and stretches to whichever is later", () => {
    expect(
      buildRoadmap({ startDate: null, targetDate: null }, [ms("a", "A", null)], [], "2026-11-17", "2026-11-01"),
    ).toBeNull();
    const road = buildRoadmap(
      { startDate: null, targetDate: null },
      [ms("a", "A", "2027-01-10"), ms("b", "B", "2026-12-01")],
      [],
      "2026-11-17",
      "2026-11-01",
    )!;
    expect(road).toMatchObject({ start: "2026-11-01", end: "2027-01-10", hasTarget: false });
    // A short path is marked in months.
    expect(road.ticks.map((t) => t.label)).toEqual(["Dec", "2027"]);
    expect(dayAt(road, 0.5)).toBe("2026-12-06");
    expect(dayAt(road, 2)).toBe("2027-01-10");
  });
});
