"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useSync } from "@/components/app/sync-provider";
import { today } from "@/lib/dates";
import type { SyncEngine } from "@/lib/sync/engine";
import type { EntityFields } from "@/lib/sync/entities";
import { AREA_PRESETS, presetAreaId, type AreaFields } from "./areas/model";
import { newGoalFields, type Goal, type GoalFields, type KeyResult } from "./goals/model";
import { defaultSettings, settingsId, type Settings } from "./settings/model";
import { newTaskFields, nextInstanceId, nextOccurrence, type Task, type TaskFields } from "./tasks/model";

const now = () => Date.now();

/** Every write in the app goes through these actions, so history and side effects are consistent. */
export function useActions() {
  const engine = useSync();
  const user = useCurrentUser();
  return useMemo(() => createActions(engine, user.id), [engine, user.id]);
}

export type Actions = ReturnType<typeof createActions>;

export function createActions(engine: SyncEngine, userId: string) {
  const db = engine.db;

  async function settings(): Promise<Settings> {
    return (await db.settings.get(settingsId(userId))) ?? defaultSettings();
  }

  async function logTaskEvent(
    fields: Omit<EntityFields<"taskEvents">, "actor" | "at"> & Partial<EntityFields<"taskEvents">>,
  ) {
    await engine.create("taskEvents", { actor: "user", at: now(), ...fields });
  }

  const actions = {
    // ------------------------------------------------------------ settings
    async saveSettings(patch: Partial<Settings>) {
      const id = settingsId(userId);
      const existing = await db.settings.get(id);
      if (existing && !existing.deletedAt) await engine.update("settings", id, patch);
      else await engine.create("settings", { ...defaultSettings(), ...patch }, id);
    },

    // ------------------------------------------------------------ areas
    async ensurePresetAreas(slugs: string[]) {
      const presets = AREA_PRESETS.filter((p) => slugs.includes(p.slug));
      for (const [i, p] of presets.entries()) {
        const id = presetAreaId(userId, p.slug);
        const existing = await db.areas.get(id);
        if (existing && !existing.deletedAt) {
          if (existing.archivedAt) await engine.update("areas", id, { archivedAt: null });
          continue;
        }
        await engine.create(
          "areas",
          { name: p.name, icon: p.icon, color: p.color, description: p.description, order: i, archivedAt: null },
          id,
        );
      }
    },
    async createArea(fields: Partial<AreaFields> & { name: string }) {
      const count = await db.areas.count();
      return engine.create("areas", {
        icon: "circle",
        color: "indigo",
        description: "",
        order: count,
        archivedAt: null,
        ...fields,
      } as AreaFields);
    },
    updateArea: (id: string, patch: Partial<AreaFields>) => engine.update("areas", id, patch),
    archiveArea: (id: string, archived: boolean) => engine.update("areas", id, { archivedAt: archived ? now() : null }),

    // ------------------------------------------------------------ goals
    createGoal: (fields: Partial<GoalFields> & { title: string }) => engine.create("goals", newGoalFields(fields)),
    updateGoal: (id: string, patch: Partial<GoalFields>) => engine.update("goals", id, patch),
    completeGoal: (id: string) => engine.update("goals", id, { status: "completed", completedAt: now() }),
    reopenGoal: (id: string) =>
      engine.update("goals", id, { status: "active", completedAt: null, droppedReason: null }),
    dropGoal: (id: string, reason: string) => engine.update("goals", id, { status: "dropped", droppedReason: reason }),
    async deleteGoal(goal: Goal) {
      const [krs, milestones, tasks] = await Promise.all([
        db.keyResults.where("goalId").equals(goal.id).toArray(),
        db.milestones.where("goalId").equals(goal.id).toArray(),
        db.tasks.where("goalId").equals(goal.id).toArray(),
      ]);
      for (const k of krs) await engine.remove("keyResults", k.id);
      for (const m of milestones) await engine.remove("milestones", m.id);
      // Tasks outlive their goal: they become unassigned rather than disappearing.
      for (const t of tasks) await engine.update("tasks", t.id, { goalId: null, milestoneId: null });
      await engine.remove("goals", goal.id);
    },

    // ------------------------------------------------------------ key results
    async createKeyResult(
      goalId: string,
      fields: Omit<EntityFields<"keyResults">, "goalId" | "order" | "current"> & { current?: number },
    ) {
      const count = await db.keyResults.where("goalId").equals(goalId).count();
      return engine.create("keyResults", { goalId, order: count, current: fields.current ?? fields.start, ...fields });
    },
    updateKeyResult: (id: string, patch: Partial<EntityFields<"keyResults">>) => engine.update("keyResults", id, patch),
    deleteKeyResult: (id: string) => engine.remove("keyResults", id),
    async checkInKeyResult(kr: KeyResult, value: number, note: string | null) {
      await engine.create("krCheckins", { keyResultId: kr.id, goalId: kr.goalId, value, note, at: now() });
      await engine.update("keyResults", kr.id, { current: value });
    },

    // ------------------------------------------------------------ milestones
    async createMilestone(goalId: string, title: string, dueDate: string | null = null) {
      const count = await db.milestones.where("goalId").equals(goalId).count();
      return engine.create("milestones", { goalId, title, dueDate, doneAt: null, order: count });
    },
    updateMilestone: (id: string, patch: Partial<EntityFields<"milestones">>) => engine.update("milestones", id, patch),
    toggleMilestone: (id: string, done: boolean) => engine.update("milestones", id, { doneAt: done ? now() : null }),
    async deleteMilestone(id: string) {
      for (const t of await db.tasks.where("milestoneId").equals(id).toArray()) {
        await engine.update("tasks", t.id, { milestoneId: null });
      }
      await engine.remove("milestones", id);
    },

    // ------------------------------------------------------------ tasks
    async createTask(fields: Partial<TaskFields> & { title: string }) {
      const id = await engine.create("tasks", newTaskFields(fields));
      await logTaskEvent({
        taskId: id,
        type: "created",
        from: null,
        to: fields.status ?? "inbox",
        reason: null,
        reasonText: null,
      });
      return id;
    },

    /** Updates a task and records history for status and date changes (PRD TASK-6). */
    async updateTask(task: Task, patch: Partial<TaskFields>) {
      const full: Partial<TaskFields> = { ...patch };
      if (patch.status && patch.status !== task.status) {
        if (patch.status === "done") full.completedAt = now();
        else if (task.status === "done") full.completedAt = null;
        if (patch.status === "cancelled") full.cancelledAt = now();
        else if (task.status === "cancelled") full.cancelledAt = null;
      }
      await engine.update("tasks", task.id, full);

      if (patch.status && patch.status !== task.status) {
        await logTaskEvent({
          taskId: task.id,
          type: "status",
          from: task.status,
          to: patch.status,
          reason: null,
          reasonText: null,
        });
        if (patch.status === "done" && task.recurrence) await actions.spawnNextOccurrence(task);
      }
      for (const field of ["dueDate", "scheduledDate"] as const) {
        if (field in patch && patch[field] !== task[field]) {
          await logTaskEvent({
            taskId: task.id,
            type: "reschedule",
            from: task[field] ?? null,
            to: patch[field] ?? null,
            reason: field,
            reasonText: null,
          });
        }
      }
    },

    setTaskDone: (task: Task, done: boolean) => actions.updateTask(task, { status: done ? "done" : "todo" }),

    /** Recurring tasks: completing one creates the next (works offline). */
    async spawnNextOccurrence(task: Task) {
      if (!task.recurrence) return;
      const s = await settings();
      const due = nextOccurrence(task.recurrence, task.dueDate, today(s.timezone));
      const rootId = task.recurrenceParentId ?? task.id;
      const id = nextInstanceId(rootId, due);
      if (await db.tasks.get(id)) return;
      const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, serverVersion: _v, number: _n, ...fields } = task;
      await engine.create(
        "tasks",
        {
          ...fields,
          status: "todo",
          dueDate: due,
          scheduledDate: null,
          completedAt: null,
          cancelledAt: null,
          recurrenceParentId: rootId,
          order: now(),
        },
        id,
      );
      await logTaskEvent({
        taskId: id,
        type: "created",
        from: null,
        to: "todo",
        reason: "recurrence",
        reasonText: null,
      });
    },

    async deleteTask(task: Task) {
      for (const sub of await db.tasks.where("parentTaskId").equals(task.id).toArray()) {
        await engine.remove("tasks", sub.id);
      }
      await engine.remove("tasks", task.id);
    },
  };
  return actions;
}
