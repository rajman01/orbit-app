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
import { isSkip, planDay, type SkipReason } from "./today/model";
import type { FocusMode } from "./focus/model";

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
      // Only ever one open next copy: completing again (after an undo) moves it instead of adding another.
      const pending = await db.tasks
        .filter(
          (t) =>
            t.recurrenceParentId === rootId &&
            t.id !== task.id &&
            t.deletedAt == null &&
            t.status !== "done" &&
            t.status !== "cancelled",
        )
        .first();
      if (pending) {
        if (pending.dueDate !== due) {
          await engine.update("tasks", pending.id, { dueDate: due });
          await logTaskEvent({
            taskId: pending.id,
            type: "reschedule",
            from: pending.dueDate ?? null,
            to: due,
            reason: "dueDate",
            reasonText: null,
          });
        }
        return;
      }
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
          // The next one starts clean: it is not today's Must-do and has never been moved.
          mustDoDate: null,
          postponeCount: 0,
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

    // ------------------------------------------------------------ today (Phase 1B)

    /** Plans a task for today; tasks still in the inbox or backlog become todo. */
    async planForToday(task: Task, todayDay: string) {
      const patch: Partial<TaskFields> = {};
      if (task.scheduledDate !== todayDay) patch.scheduledDate = todayDay;
      if (task.status === "inbox" || task.status === "backlog") patch.status = "todo";
      if (Object.keys(patch).length) await actions.updateTask(task, patch);
    },

    /** Makes a task one of today's Must-dos. The caller enforces the cap of 3 (it offers a swap). */
    async setMustDo(task: Task, todayDay: string, on: boolean) {
      if (!on) return engine.update("tasks", task.id, { mustDoDate: null });
      await actions.planForToday(task, todayDay);
      await engine.update("tasks", task.id, { mustDoDate: todayDay });
    },

    async swapMustDo(out: Task, into: Task, todayDay: string) {
      await engine.update("tasks", out.id, { mustDoDate: null });
      await actions.setMustDo(into, todayDay, true);
    },

    setTaskOrder: (task: Task, order: number) => engine.update("tasks", task.id, { order }),

    /**
     * The skip flow (PRD §8.2): moves a planned task with a reason. Every skip is recorded;
     * moving a task that was planned for today or earlier counts toward going stale.
     */
    async skipTask(
      task: Task,
      opts: {
        reason: SkipReason | null;
        reasonText?: string | null;
        to: string | null;
        todayDay: string;
        cancel?: boolean;
      },
    ) {
      const from = planDay(task);
      const counts = !opts.cancel && isSkip(task, opts.todayDay, opts.to);
      if (opts.cancel) {
        await actions.updateTask(task, { status: "cancelled", mustDoDate: null });
      } else {
        const patch: Partial<TaskFields> = { scheduledDate: opts.to, mustDoDate: null };
        if (counts) patch.postponeCount = (task.postponeCount ?? 0) + 1;
        if (opts.to && (task.status === "inbox" || task.status === "backlog")) patch.status = "todo";
        await engine.update("tasks", task.id, patch);
        if (patch.status) {
          await logTaskEvent({
            taskId: task.id,
            type: "status",
            from: task.status,
            to: "todo",
            reason: null,
            reasonText: null,
          });
        }
      }
      if (opts.reason || counts) {
        await logTaskEvent({
          taskId: task.id,
          type: "skip",
          from,
          to: opts.cancel ? "cancelled" : opts.to,
          reason: opts.reason,
          reasonText: opts.reasonText?.trim() || null,
        });
      } else if (!opts.cancel && from !== opts.to) {
        await logTaskEvent({
          taskId: task.id,
          type: "reschedule",
          from,
          to: opts.to,
          reason: "scheduledDate",
          reasonText: null,
        });
      }
    },

    /** Resolves a stale task (PRD §8.1): resets its postpone count and records how. */
    async resolveStale(
      task: Task,
      how: "break_down" | "five_minutes" | "commit" | "help" | "drop",
      opts: { to?: string | null; note?: string; subtasks?: string[] } = {},
    ) {
      const patch: Partial<TaskFields> = { postponeCount: 0 };
      if (how === "commit") patch.scheduledDate = opts.to ?? null;
      if (how === "help" && opts.note?.trim()) {
        patch.description = `${task.description ? `${task.description}\n\n` : ""}Help: ${opts.note.trim()}`;
      }
      if (how === "drop") await actions.updateTask(task, { status: "cancelled", mustDoDate: null });
      await engine.update("tasks", task.id, patch);
      for (const title of opts.subtasks ?? []) {
        if (title.trim()) {
          await actions.createTask({
            title: title.trim(),
            parentTaskId: task.id,
            status: "todo",
            areaId: task.areaId,
            goalId: task.goalId,
          });
        }
      }
      await logTaskEvent({
        taskId: task.id,
        type: "edit",
        from: null,
        to: how === "commit" ? (opts.to ?? null) : null,
        reason: `stale_${how}`,
        reasonText: how === "help" ? (opts.note?.trim() ?? null) : null,
      });
    },

    // ------------------------------------------------------------ focus (Phase 1B)

    /** Logs the start of a focus session; the task moves to in progress. */
    async startFocusSession(task: Task, mode: FocusMode, plannedMinutes: number | null, startedAt: number) {
      const id = await engine.create("focusSessions", {
        taskId: task.id,
        mode,
        plannedMinutes,
        startedAt,
        endedAt: null,
        actualMinutes: 0,
        outcome: null,
        interruptions: 0,
      });
      if (task.status !== "in_progress" && task.status !== "done")
        await actions.updateTask(task, { status: "in_progress" });
      return id;
    },

    endFocusSession: (
      id: string,
      fields: Pick<
        EntityFields<"focusSessions">,
        "endedAt" | "actualMinutes" | "outcome" | "interruptions" | "mode" | "plannedMinutes"
      >,
    ) => engine.update("focusSessions", id, fields),

    async deleteTask(task: Task) {
      for (const sub of await db.tasks.where("parentTaskId").equals(task.id).toArray()) {
        await engine.remove("tasks", sub.id);
      }
      await engine.remove("tasks", task.id);
    },
  };
  return actions;
}
