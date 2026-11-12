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
import { cycleId, cyclesToCreate, ritualId, type Cycle, type RitualType } from "./cycles/model";
import { habitLogId, habitStatus, newHabitFields, type Habit, type HabitFields } from "./habits/model";
import {
  CHECKIN_XP,
  focusXp,
  goalXp,
  habitXp,
  levelFromXp,
  MILESTONE_XP,
  RITUAL_XP,
  softCap,
  STALE_PENALTY,
  taskXp,
  totalXp,
  WIN_XP,
  xpEventId,
  type XpSource,
} from "./xp/model";
import { addDays, dayOf } from "@/lib/dates";

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

  /**
   * Records XP for a source (PRD §9). One entry per source: re-awarding updates it, undoing sets it
   * to 0 (a deleted entry could never come back, because deletes win in sync).
   */
  async function award(
    source: XpSource,
    sourceId: string,
    amount: number,
    reason: string,
    areaId: string | null = null,
  ) {
    const id = xpEventId(source, sourceId);
    const existing = await db.xpEvents.get(id);
    if (existing && !existing.deletedAt) {
      if (existing.amount === amount) return;
      await engine.update("xpEvents", id, { amount, reason, at: now() });
    } else {
      await engine.create("xpEvents", { source, sourceId, areaId, amount, reason, at: now() }, id);
    }
    const gained = amount - (existing && !existing.deletedAt ? existing.amount : 0);
    if (gained > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("orbit:xp", { detail: { amount: gained, reason } }));
    }
  }

  const goalArea = async (goalId: string | null | undefined) =>
    goalId ? ((await db.goals.get(goalId))?.areaId ?? null) : null;

  async function awardTask(task: Task, done: boolean) {
    if (task.parentTaskId) return;
    if (!done) return award("task", task.id, 0, "Reopened", task.areaId);
    const s = await settings();
    const at = now();
    const day = dayOf(at, s.timezone);
    const raw = taskXp({
      effort: task.effort,
      mustDo: task.mustDoDate === day,
      wasStale: (task.postponeCount ?? 0) >= 3,
      createdAt: task.createdAt,
      completedAt: at,
      recurring: Boolean(task.recurrence || task.recurrenceParentId),
    });
    // Soft cap (§9.1 anti-gaming): compare with today's task XP and the last 14 days' average.
    const taskEvents = (await db.xpEvents.where("source").equals("task").toArray()).filter(
      (e) => !e.deletedAt && e.sourceId !== task.id,
    );
    const from = addDays(day, -14);
    let today = 0;
    let recent = 0;
    for (const e of taskEvents) {
      const d = dayOf(e.at, s.timezone);
      if (d === day) today += e.amount;
      else if (d >= from) recent += e.amount;
    }
    const amount = softCap(raw.amount, today, recent / 14);
    await award("task", task.id, amount, amount < raw.amount ? `${raw.reason} · daily cap` : raw.reason, task.areaId);
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
    async completeGoal(id: string) {
      await engine.update("goals", id, { status: "completed", completedAt: now() });
      const g = await db.goals.get(id);
      if (!g) return;
      const s = await settings();
      const start = g.startDate ?? dayOf(g.createdAt, s.timezone);
      await award("goal", id, goalXp(start, today(s.timezone)), `Goal completed: ${g.title}`.slice(0, 200), g.areaId);
    },
    async reopenGoal(id: string) {
      await engine.update("goals", id, { status: "active", completedAt: null, droppedReason: null });
      await award("goal", id, 0, "Goal reopened", await goalArea(id));
    },
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
      const checkinId = await engine.create("krCheckins", {
        keyResultId: kr.id,
        goalId: kr.goalId,
        value,
        note,
        at: now(),
      });
      await engine.update("keyResults", kr.id, { current: value });
      await award(
        "checkin",
        checkinId,
        CHECKIN_XP,
        `Key result check-in: ${kr.title}`.slice(0, 200),
        await goalArea(kr.goalId),
      );
    },

    // ------------------------------------------------------------ milestones
    async createMilestone(goalId: string, title: string, dueDate: string | null = null) {
      const count = await db.milestones.where("goalId").equals(goalId).count();
      return engine.create("milestones", { goalId, title, dueDate, doneAt: null, order: count });
    },
    updateMilestone: (id: string, patch: Partial<EntityFields<"milestones">>) => engine.update("milestones", id, patch),
    async toggleMilestone(id: string, done: boolean) {
      await engine.update("milestones", id, { doneAt: done ? now() : null });
      const m = await db.milestones.get(id);
      const area = await goalArea(m?.goalId);
      await award(
        "milestone",
        id,
        done ? MILESTONE_XP : 0,
        done ? `Milestone: ${m?.title ?? ""}`.slice(0, 200) : "Milestone reopened",
        area,
      );
    },
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
        if (patch.status === "done") await awardTask({ ...task, ...full } as Task, true);
        else if (task.status === "done") await awardTask(task, false);
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

    // ------------------------------------------------------------ cycles (Phase 1C)

    /** Makes sure the current cycle and the next one exist (generated here, so it works offline). */
    async ensureCycles(todayDay: string) {
      const s = await settings();
      const existing = (await db.cycles.toArray()).filter((c) => !c.deletedAt);
      for (const c of cyclesToCreate(existing, todayDay, s.weekStartDay, s.cycleLengthDays)) {
        const id = cycleId(userId, c.number);
        if (await db.cycles.get(id)) continue;
        await engine.create(
          "cycles",
          {
            ...c,
            theme: null,
            focusGoalIds: [],
            committedTaskIds: [],
            committedPts: 0,
            committedAt: null,
            planningOverride: null,
            reviewCompletedAt: null,
            reflection: null,
          },
          id,
        );
      }
    },

    /** Puts a task in a cycle. The time is logged so the burn-up can show scope added mid-cycle. */
    async addToCycle(task: Task, cycle: Pick<Cycle, "id">) {
      if (task.cycleId === cycle.id) return;
      const patch: Partial<TaskFields> = { cycleId: cycle.id };
      if (task.status === "inbox" || task.status === "backlog") patch.status = "todo";
      await actions.updateTask(task, patch);
      await logTaskEvent({
        taskId: task.id,
        type: "edit",
        from: task.cycleId ?? null,
        to: cycle.id,
        reason: "cycle_add",
        reasonText: null,
      });
    },

    async removeFromCycle(task: Task) {
      if (!task.cycleId) return;
      await engine.update("tasks", task.id, { cycleId: null });
      await logTaskEvent({
        taskId: task.id,
        type: "edit",
        from: task.cycleId,
        to: null,
        reason: "cycle_remove",
        reasonText: null,
      });
    },

    /** "I commit to these tasks" (PRD CYC-2, §8.1 commitments). */
    async commitCycle(
      cycle: Cycle,
      opts: { taskIds: string[]; points: number; theme: string | null; focusGoalIds: string[] },
    ) {
      await engine.update("cycles", cycle.id, {
        committedTaskIds: opts.taskIds,
        committedPts: opts.points,
        committedAt: now(),
        theme: opts.theme?.trim() || null,
        focusGoalIds: opts.focusGoalIds.slice(0, 3),
      });
    },

    /** Plan anyway although the last cycle wasn't reviewed (Firm strictness only, §8.5). */
    overridePlanning: (cycle: Pick<Cycle, "id">, reason: string) =>
      engine.update("cycles", cycle.id, { planningOverride: reason.trim() }),

    /** Review decision for an unfinished task (PRD CYC-4): roll over, back to the backlog, or cancel. */
    async decideRollover(
      task: Task,
      decision: "rollover" | "backlog" | "cancel",
      opts: { next?: Pick<Cycle, "id" | "startDate"> | null; reason?: string | null } = {},
    ) {
      if (decision === "rollover" && opts.next) {
        // A day planned in the old cycle no longer means anything: it would only show as overdue.
        const patch: Partial<TaskFields> = { cycleId: opts.next.id, mustDoDate: null };
        if (task.scheduledDate && task.scheduledDate < opts.next.startDate) patch.scheduledDate = null;
        await engine.update("tasks", task.id, patch);
      } else if (decision === "backlog") {
        await actions.updateTask(task, { cycleId: null, status: "backlog", scheduledDate: null, mustDoDate: null });
      } else if (decision === "cancel") {
        await actions.updateTask(task, { status: "cancelled", mustDoDate: null });
      }
      await logTaskEvent({
        taskId: task.id,
        type: "edit",
        from: task.cycleId ?? null,
        to: decision === "rollover" ? (opts.next?.id ?? null) : null,
        reason: `rollover_${decision}`,
        reasonText: opts.reason?.trim() || null,
      });
    },

    completeReview: (cycle: Pick<Cycle, "id">, reflection: string | null) =>
      engine.update("cycles", cycle.id, { reviewCompletedAt: now(), reflection: reflection?.trim() || null }),

    // ------------------------------------------------------------ rituals (Phase 1C)

    /** Starts (or resumes) a ritual. One per type per day, the same id on every device. */
    async startRitual(type: RitualType, date: string, cycle: Pick<Cycle, "id"> | null = null) {
      const id = ritualId(userId, type, date);
      const existing = await db.rituals.get(id);
      if (existing && !existing.deletedAt) return id;
      await engine.create(
        "rituals",
        { type, date, cycleId: cycle?.id ?? null, startedAt: now(), completedAt: null, data: { step: 0 } },
        id,
      );
      return id;
    },

    /** Saves progress as you go, so a ritual resumes after a reload or on another device. */
    async saveRitual(id: string, patch: Record<string, unknown>) {
      const r = await db.rituals.get(id);
      if (!r) return;
      await engine.update("rituals", id, { data: { ...r.data, ...patch } });
    },

    async completeRitual(id: string, patch: Record<string, unknown> = {}) {
      const r = await db.rituals.get(id);
      if (!r) return;
      const data = { ...r.data, ...patch };
      await engine.update("rituals", id, { data, completedAt: now() });
      const names = { daily_plan: "Daily Plan", daily_shutdown: "Daily Shutdown", cycle_review: "Cycle Review" };
      await award("ritual", id, RITUAL_XP[r.type], `${names[r.type]} completed`);
      const wins = Array.isArray(data.wins) ? (data.wins as unknown[]).filter((w) => typeof w === "string" && w) : [];
      for (const [i, w] of wins.slice(0, 3).entries())
        await award("win", `${i}${id}`, WIN_XP, `Win: ${String(w)}`.slice(0, 200));
    },

    // ------------------------------------------------------------ habits (Phase 1D)

    createHabit: (fields: Partial<HabitFields> & { name: string }) => engine.create("habits", newHabitFields(fields)),
    updateHabit: (id: string, patch: Partial<HabitFields>) => engine.update("habits", id, patch),
    archiveHabit: (id: string, archived: boolean) =>
      engine.update("habits", id, { archivedAt: archived ? now() : null }),

    /** Sets the day's value for a habit (one log per habit per day) and awards XP when it's met. */
    async logHabit(habit: Habit, date: string, value: number, note: string | null = null) {
      const id = habitLogId(habit.id, date);
      const existing = await db.habitLogs.get(id);
      if (existing && !existing.deletedAt) await engine.update("habitLogs", id, { value, note });
      else await engine.create("habitLogs", { habitId: habit.id, date, value, note }, id);

      const s = await settings();
      const logs = (await db.habitLogs.where("habitId").equals(habit.id).toArray()).filter((l) => !l.deletedAt);
      const status = habitStatus(habit, logs, date, {
        weekStart: s.weekStartDay,
        startDay: dayOf(habit.createdAt, s.timezone),
      });
      const met = habit.targetType === "boolean" ? value >= 1 : value >= habit.targetCount;
      const streakDays = status.unit === "week" ? status.streak * 7 : status.streak;
      await award(
        "habit",
        id,
        met ? habitXp(streakDays) : 0,
        met ? `Habit: ${habit.name}` : "Habit unchecked",
        habit.areaId,
      );
    },

    /**
     * Strict mode (§9.3): each unresolved stale task costs 5 XP a day, never dropping the total
     * below the floor of the current level. Safe to call repeatedly: one entry per task per day.
     */
    async applyStalePenalties(todayDay: string, staleTaskIds: string[]) {
      if (!staleTaskIds.length) return;
      const events = await db.xpEvents.toArray();
      let total = totalXp(events);
      const floor = levelFromXp(total).floor;
      for (const taskId of staleTaskIds) {
        const id = xpEventId("penalty", `${todayDay}${taskId}`);
        if (await db.xpEvents.get(id)) continue;
        if (total - STALE_PENALTY < floor) break;
        await engine.create(
          "xpEvents",
          {
            source: "penalty",
            sourceId: `${todayDay}${taskId}`,
            areaId: null,
            amount: -STALE_PENALTY,
            reason: "Stale task left unresolved (Strict)",
            at: now(),
          },
          id,
        );
        total -= STALE_PENALTY;
      }
    },

    // ------------------------------------------------------------ reminders (Phase 1D)

    /** Schedules (or moves) a one-off reminder the server will push at `fireAt`. */
    async scheduleReminder(id: string, fields: Omit<EntityFields<"reminders">, "status">) {
      const existing = await db.reminders.get(id);
      if (existing && !existing.deletedAt) {
        if (existing.fireAt === fields.fireAt && existing.status === "pending") return;
        await engine.update("reminders", id, { ...fields, status: "pending" });
      } else {
        await engine.create("reminders", { ...fields, status: "pending" }, id);
      }
    },

    async cancelReminder(id: string) {
      const existing = await db.reminders.get(id);
      if (existing && !existing.deletedAt && existing.status !== "cancelled") {
        await engine.update("reminders", id, { status: "cancelled" });
      }
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

    async endFocusSession(
      id: string,
      fields: Pick<
        EntityFields<"focusSessions">,
        "endedAt" | "actualMinutes" | "outcome" | "interruptions" | "mode" | "plannedMinutes"
      >,
    ) {
      await engine.update("focusSessions", id, fields);
      const session = await db.focusSessions.get(id);
      const task = session ? await db.tasks.get(session.taskId) : undefined;
      const xp = focusXp(fields.actualMinutes);
      if (xp > 0)
        await award("focus", id, xp, `${Math.round(fields.actualMinutes)} min of focus`, task?.areaId ?? null);
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
