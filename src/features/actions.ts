"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useSync } from "@/components/app/sync-provider";
import { today } from "@/lib/dates";
import type { SyncEngine } from "@/lib/sync/engine";
import type { EntityFields } from "@/lib/sync/entities";
type SavedViewFields = EntityFields<"savedViews">;
import { AREA_PRESETS, presetAreaId, type AreaFields } from "./areas/model";
import { newGoalFields, type Goal, type GoalFields, type KeyResult } from "./goals/model";
import { defaultSettings, settingsId, type Settings } from "./settings/model";
import {
  newTaskFields,
  nextInstanceId,
  nextOccurrence,
  withTaskDefaults,
  type Task,
  type TaskFields,
} from "./tasks/model";
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
import { newPersonFields, type InteractionType, type PersonFields } from "./people/model";
import { ratingId } from "./insights/model";
import {
  careerProfileId,
  searchSettings,
  type CareerProfileFields,
  type JobPosting,
  type SearchSettings,
} from "./jobs/model";
import {
  newRoutineFields,
  routineRunId,
  runProgress,
  ROUTINE_XP,
  type Routine,
  type RoutineFields,
} from "./routines/model";
import { newlyUnblocked, wouldLoop } from "./tasks/links";
import {
  CATEGORY_PRESETS,
  newAccountFields,
  newCategoryFields,
  newTransactionFields,
  presetCategoryId,
  type AccountFields,
  type CategoryFields,
  type TransactionFields,
} from "./money/model";
import { budgetId } from "./money/budgets";
import { instanceFields, type DueOccurrence } from "./money/recurring";
import { newPotFields, potBalance, type Pot, type PotFields } from "./money/pots";
import { importFields, type ImportRow } from "./money/import";
import { incomeEntryId, incomeId, type IncomeSource } from "./money/plan";
import { debtState, newDebtFields, type Debt, type DebtFields } from "./money/debts";
import { holdingValueId, newHoldingFields, type HoldingFields } from "./money/holdings";
import { formatMoney, minorPerMajor } from "./money/model";
import { subjectThreadId, type CoachSubject } from "./coach/subject";
import {
  learningPatch,
  learningXp,
  newLeadFields,
  newLearningFields,
  newSkillFields,
  SKILL_LEVEL_XP,
  SKILL_LEVELS,
  stagePatch,
  type JobLead,
  type JobLeadFields,
  type LearningFields,
  type LearningItem,
  type Skill,
  type SkillFields,
} from "./career/model";
import {
  effortFor,
  scheduleSections,
  sectionMinutes,
  sectionProgress,
  type CoursePlan,
  type Section,
} from "./career/course";
import { emptyEntry, journalId, withLine, type JournalFields } from "./journal/model";
import { newWinFields, ritualWinId, taskWinId, type WinFields } from "./wins/model";
import {
  emptyVision,
  newQuarterFields,
  quarterId,
  visionId,
  type QuarterFields,
  type QuarterRef,
  type VisionFields,
} from "./quarters/model";

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

  async function logGoalEvent(
    goalId: string,
    type: "status" | "health" | "note",
    from: string | null,
    to: string | null,
    text: string | null,
  ) {
    await engine.create("goalEvents", { goalId, type, from, to, text, actor: "user", at: now() });
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
      let existing = await db.settings.get(id);
      // A device that hasn't synced yet has no settings here, though the account may. Creating a
      // fresh default document then would overwrite the real settings everywhere (newest write
      // wins per field), so fetch them first; only a genuinely new account starts from defaults.
      if (!existing && (await engine.whenSynced?.())) existing = await db.settings.get(id);
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
    /** Updates a goal; status and health changes go in its updates feed (GOAL-7). */
    async updateGoal(id: string, patch: Partial<GoalFields>) {
      const before = await db.goals.get(id);
      await engine.update("goals", id, patch);
      if (!before) return;
      if (patch.status !== undefined && patch.status !== before.status)
        await logGoalEvent(id, "status", before.status, patch.status, patch.droppedReason ?? null);
      if (patch.health !== undefined && patch.health !== before.health)
        await logGoalEvent(id, "health", before.health, patch.health, null);
    },
    async completeGoal(id: string) {
      const before = await db.goals.get(id);
      await engine.update("goals", id, { status: "completed", completedAt: now() });
      if (before && before.status !== "completed") await logGoalEvent(id, "status", before.status, "completed", null);
      const g = await db.goals.get(id);
      if (!g) return;
      const s = await settings();
      const start = g.startDate ?? dayOf(g.createdAt, s.timezone);
      await award("goal", id, goalXp(start, today(s.timezone)), `Goal completed: ${g.title}`.slice(0, 200), g.areaId);
    },
    async reopenGoal(id: string) {
      const before = await db.goals.get(id);
      await engine.update("goals", id, { status: "active", completedAt: null, droppedReason: null });
      if (before && before.status !== "active") await logGoalEvent(id, "status", before.status, "active", null);
      await award("goal", id, 0, "Goal reopened", await goalArea(id));
    },
    async dropGoal(id: string, reason: string) {
      const before = await db.goals.get(id);
      await engine.update("goals", id, { status: "dropped", droppedReason: reason });
      if (before && before.status !== "dropped") await logGoalEvent(id, "status", before.status, "dropped", reason);
    },
    /** GOAL-7: a note in the goal's updates feed, like a project update. */
    addGoalUpdate: (goalId: string, text: string) =>
      logGoalEvent(goalId, "note", null, null, text.trim().slice(0, 5000)),
    deleteGoalUpdate: (id: string) => engine.remove("goalEvents", id),
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
        if ((patch.status === "done" || patch.status === "cancelled") && typeof window !== "undefined") {
          // TASK-8: say what finishing this let go.
          const freed = newlyUnblocked(task.id, (await db.tasks.toArray()).map(withTaskDefaults));
          if (freed.length)
            window.dispatchEvent(new CustomEvent("orbit:unblocked", { detail: { titles: freed.map((t) => t.title) } }));
        }
        if (patch.status === "done") await awardTask({ ...task, ...full } as Task, true);
        else if (task.status === "done") await awardTask(task, false);
        // CAR-6: a course section's task ticks the section (and the course's progress) with it.
        if (task.learningItemId && task.learningSectionId && (patch.status === "done" || task.status === "done"))
          await actions.markSection(task.learningItemId, task.learningSectionId, patch.status === "done");
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

    /** Theme and focus goals (CYC-7), e.g. set while planning with the coach. */
    updateCycle: (id: string, patch: Partial<Pick<EntityFields<"cycles">, "theme" | "focusGoalIds">>) =>
      engine.update("cycles", id, patch),

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
    async startRitual(
      type: RitualType,
      date: string,
      cycle: Pick<Cycle, "id"> | null = null,
      quarter: QuarterRef | null = null,
    ) {
      const id = ritualId(userId, type, date);
      const existing = await db.rituals.get(id);
      if (existing && !existing.deletedAt) return id;
      // A ritual for a quarter needs the quarter's document to point at.
      const qid = quarter ? await actions.ensureQuarter(quarter) : null;
      await engine.create(
        "rituals",
        {
          type,
          date,
          cycleId: cycle?.id ?? null,
          ...(qid ? { quarterId: qid } : {}),
          startedAt: now(),
          completedAt: null,
          data: { step: 0 },
        },
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
      const names = {
        daily_plan: "Daily Plan",
        daily_shutdown: "Daily Shutdown",
        cycle_review: "Cycle Review",
        quarterly_plan: "Quarterly Plan",
        quarterly_review: "Quarterly Review",
      };
      await award("ritual", id, RITUAL_XP[r.type], `${names[r.type]} completed`);
      const wins = Array.isArray(data.wins) ? (data.wins as unknown[]).filter((w) => typeof w === "string" && w) : [];
      for (const [i, w] of wins.slice(0, 3).entries())
        await award("win", `${i}${id}`, WIN_XP, `Win: ${String(w)}`.slice(0, 200));
      // Review wins go in the wins log too (CAR-1), once each.
      if (r.type === "cycle_review" || r.type === "quarterly_review") {
        for (const [i, w] of wins.slice(0, 3).entries()) {
          const winId = ritualWinId(id, i);
          const existing = await db.wins.get(winId);
          if (existing && !existing.deletedAt) await engine.update("wins", winId, { title: String(w).slice(0, 200) });
          else await actions.createWin({ title: String(w), date: r.date, source: r.type }, winId);
        }
      }
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
        plannedMs: plannedMinutes == null ? null : plannedMinutes * 60_000,
        pausedAt: null,
        pausedMs: 0,
        breakEndsAt: null,
      });
      if (task.status !== "in_progress" && task.status !== "done")
        await actions.updateTask(task, { status: "in_progress" });
      return id;
    },

    /** Writes the live timer (pause, +5 min, break…) so other devices follow along. */
    updateFocusSession: (id: string, fields: Partial<EntityFields<"focusSessions">>) =>
      engine.update("focusSessions", id, fields),

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

    // ------------------------------------------------------------ calendars (Phase 2B)

    /** Which calendars Orbit shows (the only calendar field a device may change). */
    showCalendar: (id: string, selected: boolean) => engine.update("calendars", id, { selected }),

    /** Sets time aside for a task (or just a title) — CAL-4. The server puts it on the Orbit calendar. */
    blockTime: (fields: { taskId: string | null; title: string; start: number; end: number }) =>
      engine.create("timeBlocks", {
        taskId: fields.taskId,
        title: fields.title.trim().slice(0, 500) || "Time block",
        start: fields.start,
        end: Math.max(fields.end, fields.start + 5 * 60_000),
      }),
    moveTimeBlock: (id: string, start: number, end: number) =>
      engine.update("timeBlocks", id, { start, end: Math.max(end, start + 5 * 60_000) }),
    renameTimeBlock: (id: string, title: string) =>
      engine.update("timeBlocks", id, { title: title.trim().slice(0, 500) || "Time block" }),
    deleteTimeBlock: (id: string) => engine.remove("timeBlocks", id),

    // ------------------------------------------------------------ journal and wins (Phase 2D.3)

    /** Saves part of a day's journal entry (JRN-1), creating it the first time. */
    async saveJournal(date: string, patch: Partial<JournalFields>) {
      const id = journalId(userId, date);
      const existing = await db.journalEntries.get(id);
      if (existing && !existing.deletedAt) await engine.update("journalEntries", id, patch);
      else await engine.create("journalEntries", { ...emptyEntry(date), ...patch }, id);
    },
    /** The Shutdown's mood, energy and line go into that day's entry. */
    async journalFromShutdown(date: string, f: { mood?: number; energy?: number; note?: string }) {
      const existing = await db.journalEntries.get(journalId(userId, date));
      const text = existing && !existing.deletedAt ? existing.text : "";
      const patch: Partial<JournalFields> = {};
      if (f.mood) patch.mood = f.mood;
      if (f.energy) patch.energy = f.energy;
      if (f.note?.trim() && withLine(text, f.note) !== text) patch.text = withLine(text, f.note);
      if (Object.keys(patch).length) await actions.saveJournal(date, patch);
    },

    createWin: (fields: Partial<WinFields> & { title: string; date: string }, id?: string) =>
      engine.create("wins", newWinFields({ ...fields, title: fields.title.trim().slice(0, 200) }), id),
    updateWin: (id: string, patch: Partial<WinFields>) => engine.update("wins", id, patch),
    deleteWin: (id: string) => engine.remove("wins", id),
    /** CAR-1: "Log as win" on a completed task (once per task). */
    async logTaskAsWin(task: Task) {
      const id = taskWinId(task.id);
      const existing = await db.wins.get(id);
      if (existing && !existing.deletedAt) return id;
      const s = await settings();
      return actions.createWin(
        {
          title: task.title,
          date: task.completedAt ? dayOf(task.completedAt, s.timezone) : today(s.timezone),
          areaId: task.areaId,
          goalId: task.goalId,
          taskId: task.id,
          source: "task",
        },
        id,
      );
    },

    // ------------------------------------------------------------ vision and quarters (Phase 2D)

    /** Saves part of the vision (VIS-1), creating it the first time. */
    async saveVision(patch: Partial<VisionFields>) {
      const id = visionId(userId);
      const existing = await db.vision.get(id);
      if (existing && !existing.deletedAt) await engine.update("vision", id, patch);
      else await engine.create("vision", { ...emptyVision(), ...patch }, id);
    },
    async setYearTheme(year: number, theme: string) {
      const v = await db.vision.get(visionId(userId));
      const themes = (v && !v.deletedAt ? v.themes : []).filter((t) => t.year !== year);
      if (theme.trim()) themes.push({ year, theme: theme.trim().slice(0, 120) });
      await actions.saveVision({ themes: themes.sort((a, b) => a.year - b.year) });
    },

    /** The quarter's document, made the first time something is saved for it. */
    async ensureQuarter(ref: QuarterRef) {
      const id = quarterId(userId, ref);
      const existing = await db.quarters.get(id);
      if (!existing || existing.deletedAt) await engine.create("quarters", newQuarterFields(ref), id);
      return id;
    },
    /** One write: a new quarter is created with the change already in it. */
    async updateQuarter(ref: QuarterRef, patch: Partial<QuarterFields>) {
      const id = quarterId(userId, ref);
      const existing = await db.quarters.get(id);
      if (existing && !existing.deletedAt) await engine.update("quarters", id, patch);
      else await engine.create("quarters", { ...newQuarterFields(ref), ...patch }, id);
    },
    async setQuarterGoals(ref: QuarterRef, goalIds: string[]) {
      await actions.updateQuarter(ref, { goalIds: [...new Set(goalIds)].slice(0, 10) });
    },
    /** QTR-2: the explicit commitment at the end of the Quarterly Plan. */
    commitQuarter: (ref: QuarterRef, opts: { goalIds: string[]; theme: string | null }) =>
      actions.updateQuarter(ref, {
        goalIds: [...new Set(opts.goalIds)].slice(0, 10),
        theme: opts.theme?.trim() || null,
        committedAt: now(),
      }),
    /** QTR-4: plan the next quarter anyway (Firm), with a reason. */
    overrideQuarterPlanning: (ref: QuarterRef, reason: string) =>
      actions.updateQuarter(ref, { planningOverride: reason.trim().slice(0, 500) }),
    completeQuarterReview: (ref: QuarterRef, reflection: string | null) =>
      actions.updateQuarter(ref, { reviewCompletedAt: now(), reflection: reflection?.trim() || null }),

    // ------------------------------------------------------------ people (Phase 2C)

    /** Adds someone; they go in the Relationships area when there is one. */
    async createPerson(fields: Partial<PersonFields> & { name: string }) {
      let areaId = fields.areaId;
      if (areaId === undefined) {
        const rel = await db.areas.get(presetAreaId(userId, "relationships"));
        areaId = rel && !rel.deletedAt && !rel.archivedAt ? rel.id : null;
      }
      return engine.create("people", newPersonFields({ ...fields, name: fields.name.trim(), areaId }));
    },
    updatePerson: (id: string, patch: Partial<PersonFields>) => engine.update("people", id, patch),
    archivePerson: (id: string, archived: boolean) =>
      engine.update("people", id, { archivedAt: archived ? now() : null }),
    snoozePerson: (id: string, until: string | null) => engine.update("people", id, { snoozedUntil: until }),

    /** Deletes someone with their log and notes; tasks about them stay, without the link. */
    async deletePerson(id: string) {
      const [interactions, items, tasks] = await Promise.all([
        db.interactions.where("personId").equals(id).toArray(),
        db.personItems.where("personId").equals(id).toArray(),
        db.tasks.where("personId").equals(id).toArray(),
      ]);
      for (const i of interactions) if (!i.deletedAt) await engine.remove("interactions", i.id);
      for (const i of items) if (!i.deletedAt) await engine.remove("personItems", i.id);
      for (const t of tasks) if (!t.deletedAt) await engine.update("tasks", t.id, { personId: null });
      for (const g of await db.goals.toArray()) {
        if (!g.deletedAt && g.personIds?.includes(id))
          await engine.update("goals", g.id, { personIds: g.personIds.filter((p) => p !== id) });
      }
      await engine.remove("people", id);
    },

    /**
     * Logs a call, message or meeting (REL-4). It resets the keep-in-touch clock and ends a snooze;
     * a follow-up becomes a task about the person.
     */
    async logInteraction(
      personId: string,
      fields: { date: string; type: InteractionType; notes: string },
      followUp?: { title: string; scheduledDate: string | null } | null,
    ) {
      const id = await engine.create("interactions", { personId, ...fields, notes: fields.notes.trim() });
      const person = await db.people.get(personId);
      if (person?.snoozedUntil) await engine.update("people", personId, { snoozedUntil: null });
      let taskId: string | null = null;
      if (followUp?.title.trim()) {
        taskId = await actions.createTask({
          title: followUp.title.trim(),
          status: "todo",
          personId,
          areaId: person?.areaId ?? null,
          scheduledDate: followUp.scheduledDate,
        });
      }
      return { id, taskId };
    },
    updateInteraction: (id: string, patch: Partial<EntityFields<"interactions">>) =>
      engine.update("interactions", id, patch),
    deleteInteraction: (id: string) => engine.remove("interactions", id),

    addPersonItem: (personId: string, kind: "gift" | "remember", text: string) =>
      engine.create("personItems", { personId, kind, text: text.trim().slice(0, 500), doneAt: null }),
    updatePersonItem: (id: string, text: string) =>
      engine.update("personItems", id, { text: text.trim().slice(0, 500) }),
    togglePersonItem: (id: string, done: boolean) => engine.update("personItems", id, { doneAt: done ? now() : null }),
    deletePersonItem: (id: string) => engine.remove("personItems", id),

    // ------------------------------------------------------------ coach (Phase 2A)

    createCoachThread: (title: string, at: number = now()) =>
      engine.create("aiThreads", { title: title.slice(0, 200), lastMessageAt: at, archivedAt: null }),

    async appendCoachMessage(
      threadId: string,
      role: EntityFields<"aiMessages">["role"],
      content: EntityFields<"aiMessages">["content"],
    ) {
      const last = await db.aiMessages
        .where("[threadId+seq]")
        .between([threadId, -Infinity], [threadId, Infinity])
        .last();
      const at = now();
      const id = await engine.create("aiMessages", { threadId, seq: (last?.seq ?? -1) + 1, role, content, at });
      await engine.update("aiThreads", threadId, { lastMessageAt: at });
      return id;
    },

    /**
     * Phase 3H: the one conversation about a goal, task, job or course (a fixed id, so every device
     * finds the same one). Made on first use; brought back if it was archived; kept titled after it.
     */
    async openSubjectThread(subject: CoachSubject, title: string): Promise<string> {
      const id = subjectThreadId(subject);
      const existing = await db.aiThreads.get(id);
      const name = title.slice(0, 200);
      if (!existing) {
        await engine.create(
          "aiThreads",
          {
            title: name,
            lastMessageAt: now(),
            archivedAt: null,
            subjectKind: subject.kind,
            subjectId: subject.id,
            summary: null,
          },
          id,
        );
      } else if (existing.archivedAt != null || existing.title !== name) {
        await engine.update("aiThreads", id, { archivedAt: null, title: name });
      }
      return id;
    },
    saveCoachSummary: (id: string, summary: { text: string; upToSeq: number }) =>
      engine.update("aiThreads", id, { summary: { text: summary.text.slice(0, 8000), upToSeq: summary.upToSeq } }),

    renameCoachThread: (id: string, title: string) => engine.update("aiThreads", id, { title: title.slice(0, 200) }),
    archiveCoachThread: (id: string) => engine.update("aiThreads", id, { archivedAt: now() }),

    remember: (text: string, source: "user" | "coach" = "coach") =>
      engine.create("aiMemories", { text: text.trim().slice(0, 500), source, archivedAt: null }),
    updateMemory: (id: string, text: string) => engine.update("aiMemories", id, { text: text.trim().slice(0, 500) }),
    forgetMemory: (id: string) => engine.update("aiMemories", id, { archivedAt: now() }),

    // ---------------------------------------------------------------- routines (Phase 3C, HAB-5)

    createRoutine: (fields: Partial<RoutineFields> & { name: string }) =>
      engine.create("routines", newRoutineFields(fields)),
    updateRoutine: (id: string, patch: Partial<RoutineFields>) => engine.update("routines", id, patch),
    archiveRoutine: (id: string, archived: boolean) =>
      engine.update("routines", id, { archivedAt: archived ? now() : null }),
    deleteRoutine: (id: string) => engine.remove("routines", id),

    /** Today's run of a routine, made when you start it. */
    async startRoutine(routine: Routine, date: string) {
      const id = routineRunId(routine.id, date);
      const existing = await db.routineRuns.get(id);
      if (existing && !existing.deletedAt) return id;
      await engine.create(
        "routineRuns",
        { routineId: routine.id, date, doneStepIds: [], skippedStepIds: [], startedAt: now(), completedAt: null },
        id,
      );
      return id;
    },

    /**
     * Marks a step done (or skipped). A step tied to a habit logs it for the day; the last step
     * finishes the run and earns XP.
     */
    async finishRoutineStep(routine: Routine, date: string, stepId: string, how: "done" | "skipped" = "done") {
      const id = await actions.startRoutine(routine, date);
      const run = (await db.routineRuns.get(id))!;
      const doneIds =
        how === "done" ? [...new Set([...run.doneStepIds, stepId])] : run.doneStepIds.filter((x) => x !== stepId);
      const skippedIds =
        how === "skipped"
          ? [...new Set([...run.skippedStepIds, stepId])]
          : run.skippedStepIds.filter((x) => x !== stepId);
      const progress = runProgress(routine, { doneStepIds: doneIds, skippedStepIds: skippedIds, completedAt: null });
      await engine.update("routineRuns", id, {
        doneStepIds: doneIds,
        skippedStepIds: skippedIds,
        completedAt: progress.complete ? (run.completedAt ?? now()) : null,
      });
      const step = routine.steps.find((x) => x.id === stepId);
      if (how === "done" && step?.habitId) {
        const habit = await db.habits.get(step.habitId);
        if (habit && !habit.deletedAt && !habit.archivedAt)
          await actions.logHabit(habit, date, habit.targetType === "boolean" ? 1 : habit.targetCount);
      }
      if (progress.complete && !run.completedAt) await award("routine", id, ROUTINE_XP, `Routine: ${routine.name}`);
    },

    /** Takes a step back to not done (and the run with it, if it was finished). */
    async undoRoutineStep(routine: Routine, date: string, stepId: string) {
      const id = routineRunId(routine.id, date);
      const run = await db.routineRuns.get(id);
      if (!run || run.deletedAt) return;
      await engine.update("routineRuns", id, {
        doneStepIds: run.doneStepIds.filter((x) => x !== stepId),
        skippedStepIds: run.skippedStepIds.filter((x) => x !== stepId),
        completedAt: null,
      });
      if (run.completedAt) await award("routine", id, 0, "Routine reopened");
    },

    // ---------------------------------------------------------------- task links (Phase 3C, TASK-8)

    /** "Blocked by": refuses a link that would make the two wait on each other. */
    async addBlocker(task: Task, blockerId: string) {
      const all = (await db.tasks.toArray()).filter((t) => !t.deletedAt);
      if (wouldLoop(task.id, blockerId, all)) throw new Error("That would make them wait on each other.");
      const blockedBy = [...new Set([...(task.blockedBy ?? []), blockerId])].slice(0, 20);
      await engine.update("tasks", task.id, { blockedBy });
    },
    removeBlocker: (task: Task, blockerId: string) =>
      engine.update("tasks", task.id, { blockedBy: (task.blockedBy ?? []).filter((x) => x !== blockerId) }),

    // ---------------------------------------------------------------- job assistant (Phase 3D, CAR-5)

    /** Saves the whole career profile (it's one document). */
    async saveCareerProfile(fields: CareerProfileFields) {
      const id = careerProfileId(userId);
      const existing = await db.careerProfile.get(id);
      // Search settings are saved on their own (3D.4), so an open profile page can't undo them.
      const { search: _search, ...rest } = fields;
      if (existing && !existing.deletedAt) await engine.update("careerProfile", id, rest);
      else await engine.create("careerProfile", fields, id);
    },

    /** 3D.4: change how the daily search runs (pause, hour, limits, sources). */
    async updateJobSearch(patch: Partial<SearchSettings>) {
      const id = careerProfileId(userId);
      const existing = await db.careerProfile.get(id);
      if (!existing || existing.deletedAt) return;
      await engine.update("careerProfile", id, { search: { ...searchSettings(existing), ...patch } });
    },

    setPostingStatus: (id: string, status: "new" | "saved" | "dismissed") =>
      engine.update("jobPostings", id, { status }),

    /** A found role becomes a lead on the board, with "Prepare the application" as its next step today. */
    async postingToLead(posting: JobPosting, todayDay: string) {
      if (posting.leadId) {
        const lead = await db.jobLeads.get(posting.leadId);
        if (lead && !lead.deletedAt) return posting.leadId;
      }
      const leadId = await actions.createJobLead({
        company: posting.company || "Company",
        role: posting.title,
        url: posting.url || null,
        location: posting.location || null,
        salary: posting.salary || null,
        nextStep: "Prepare the application",
        nextDate: todayDay,
        postingId: posting.id,
      });
      await engine.update("jobPostings", posting.id, { status: "lead", leadId });
      return leadId;
    },

    // ---------------------------------------------------------------- career (Phase 3B)

    createSkill: (fields: Partial<SkillFields> & { name: string }) => engine.create("skills", newSkillFields(fields)),

    /** Levelling up earns XP for each level gained; lowering a level takes it back. */
    async updateSkill(skill: Skill, patch: Partial<SkillFields>) {
      if (patch.level != null && patch.targetLevel == null && patch.level > skill.targetLevel)
        patch = { ...patch, targetLevel: patch.level };
      await engine.update("skills", skill.id, patch);
      if (patch.level == null || patch.level === skill.level) return;
      const lo = Math.min(skill.level, patch.level);
      const hi = Math.max(skill.level, patch.level);
      for (let level = lo + 1; level <= hi; level++) {
        const sourceId = `${skill.id}${level}`;
        const gained = patch.level >= level;
        const existing = await db.xpEvents.get(xpEventId("skill", sourceId));
        if (!gained && (!existing || existing.deletedAt)) continue;
        await award(
          "skill",
          sourceId,
          gained ? SKILL_LEVEL_XP : 0,
          gained ? `${skill.name}: ${SKILL_LEVELS[level].label}` : "Skill level lowered",
          skill.areaId,
        );
      }
    },
    archiveSkill: (id: string, archived: boolean) =>
      engine.update("skills", id, { archivedAt: archived ? now() : null }),
    async deleteSkill(id: string) {
      // Learning and tasks stay; they just lose the link.
      for (const l of await db.learningItems.where("skillId").equals(id).toArray())
        if (!l.deletedAt) await engine.update("learningItems", l.id, { skillId: null });
      for (const t of await db.tasks.where("skillId").equals(id).toArray())
        if (!t.deletedAt) await engine.update("tasks", t.id, { skillId: null });
      await engine.remove("skills", id);
    },

    createLearningItem: (fields: Partial<LearningFields> & { title: string }) =>
      engine.create("learningItems", newLearningFields(fields)),

    /** Status and progress move together (learningPatch); finishing earns XP, unfinishing takes it back. */
    async updateLearningItem(item: LearningItem, patch: Partial<LearningFields>) {
      const { status, progress, ...rest } = patch;
      const full = {
        ...rest,
        ...(status != null || progress != null ? learningPatch(item, { status, progress }, now()) : {}),
      };
      if (!Object.keys(full).length) return;
      await engine.update("learningItems", item.id, full);
      const was = item.status === "done";
      const is = (full.status ?? item.status) === "done";
      if (was !== is) {
        const skill = item.skillId ? await db.skills.get(item.skillId) : undefined;
        await award(
          "learning",
          item.id,
          is ? learningXp(full.kind ?? item.kind) : 0,
          is ? `Finished: ${full.title ?? item.title}` : "Learning reopened",
          skill?.areaId ?? null,
        );
      }
    },
    async deleteLearningItem(id: string) {
      // Its planned sections that aren't done go with it.
      for (const t of await db.tasks.where("learningItemId").equals(id).toArray())
        if (!t.deletedAt && t.status !== "done") await engine.remove("tasks", t.id);
      await engine.remove("learningItems", id);
    },

    // ---------------------------------------------------------------- course sections (Phase 3F, CAR-6)

    /** Replaces the sections; progress follows the ones done. */
    async setSections(item: LearningItem, sections: Section[]) {
      await engine.update("learningItems", item.id, { sections });
      if (sections.length)
        await actions.updateLearningItem({ ...item, sections }, { progress: sectionProgress(sections) });
    },

    /** Marks a section done (or not) and moves the course's progress with it; finishing the last finishes the course. */
    async markSection(itemId: string, sectionId: string, done: boolean) {
      const item = await db.learningItems.get(itemId);
      if (!item || item.deletedAt) return;
      const sections = (item.sections ?? []).map((s) =>
        s.id === sectionId ? { ...s, doneAt: done ? (s.doneAt ?? now()) : null } : s,
      );
      await engine.update("learningItems", item.id, { sections });
      await actions.updateLearningItem({ ...item, sections }, { progress: sectionProgress(sections) });
    },

    /** Ticking a section on the course page: through its task when it has one, so both stay in step. */
    async toggleSection(item: LearningItem, sectionId: string, done: boolean) {
      const section = (item.sections ?? []).find((s) => s.id === sectionId);
      const task = section?.taskId ? await db.tasks.get(section.taskId) : undefined;
      if (task && !task.deletedAt) await actions.setTaskDone(withTaskDefaults(task), done);
      else await actions.markSection(item.id, sectionId, done);
    },

    /**
     * "Plan it": the sections still to do become tasks (or their tasks move) on study days up to the
     * target date, sized by length, in the cycle that holds each day. Returns the schedule.
     */
    async planCourse(item: LearningItem, plan: Omit<CoursePlan, "plannedAt">, todayDay: string) {
      const sections = item.sections ?? [];
      const schedule = scheduleSections(sections, { ...plan, start: todayDay });
      const cycles = (await db.cycles.toArray()).filter((c) => !c.deletedAt);
      const skill = item.skillId ? await db.skills.get(item.skillId) : undefined;
      const taskIds = new Map<string, string>();
      for (const { sectionId, day } of schedule.days) {
        const s = sections.find((x) => x.id === sectionId)!;
        const cycleId = cycles.find((c) => c.startDate <= day && c.endDate >= day)?.id ?? null;
        const existing = s.taskId ? await db.tasks.get(s.taskId) : undefined;
        if (existing && !existing.deletedAt && existing.status !== "done" && existing.status !== "cancelled") {
          await engine.update("tasks", existing.id, { scheduledDate: day, cycleId });
          taskIds.set(sectionId, existing.id);
        } else {
          const id = await actions.createTask({
            title: `${item.title}: ${s.title}`.slice(0, 500),
            status: "todo",
            scheduledDate: day,
            effort: effortFor(sectionMinutes(s)),
            skillId: item.skillId,
            areaId: skill?.areaId ?? null,
            goalId: skill?.goalId ?? null,
            cycleId,
            learningItemId: item.id,
            learningSectionId: s.id,
          });
          taskIds.set(sectionId, id);
        }
      }
      const next = sections.map((s) => (taskIds.has(s.id) ? { ...s, taskId: taskIds.get(s.id)! } : s));
      await engine.update("learningItems", item.id, { sections: next, plan: { ...plan, plannedAt: now() } });
      if (item.status === "queued") await actions.updateLearningItem(item, { status: "in_progress" });
      return schedule;
    },

    /** Removes the plan: the open section tasks go; sections and progress stay. */
    async unplanCourse(item: LearningItem) {
      const sections = (item.sections ?? []).map((s) => ({ ...s }));
      for (const s of sections) {
        if (!s.taskId || s.doneAt) continue;
        const t = await db.tasks.get(s.taskId);
        if (t && !t.deletedAt && t.status !== "done") await engine.remove("tasks", t.id);
        s.taskId = null;
      }
      await engine.update("learningItems", item.id, { sections, plan: null });
    },

    createJobLead: (fields: Partial<JobLeadFields> & { company: string }) =>
      engine.create("jobLeads", newLeadFields(fields, now())),
    updateJobLead: (id: string, patch: Partial<JobLeadFields>) => engine.update("jobLeads", id, patch),
    /** CAR-4: moving along the pipeline keeps applied, interviewed and closed times. */
    async moveJobLead(lead: JobLead, stage: JobLeadFields["stage"], outcome: JobLeadFields["outcome"] = null) {
      const patch = stagePatch(lead, stage, outcome, now());
      if (Object.keys(patch).length) await engine.update("jobLeads", lead.id, patch);
    },
    deleteJobLead: (id: string) => engine.remove("jobLeads", id),

    /** AREA-4: today's Wheel of Life rating (rating again the same day replaces it). */
    async saveAreaRating(date: string, fields: Pick<EntityFields<"areaRatings">, "scores" | "note">) {
      const id = ratingId(userId, date);
      const existing = await db.areaRatings.get(id);
      if (existing && !existing.deletedAt) await engine.update("areaRatings", id, fields);
      else await engine.create("areaRatings", { date, ...fields }, id);
      return id;
    },

    /** TASK-7: one change applied to several tasks, with history and XP as if done one by one. */
    async bulkUpdateTasks(tasks: Task[], patch: Partial<TaskFields>) {
      for (const t of tasks) await actions.updateTask(t, patch);
    },

    /** TASK-7: moves tasks into a cycle (or out of one, with null). */
    async bulkSetCycle(tasks: Task[], cycleId: string | null) {
      for (const t of tasks) {
        if (cycleId) await actions.addToCycle(t, { id: cycleId });
        else await actions.removeFromCycle(t);
      }
    },

    async bulkDeleteTasks(tasks: Task[]) {
      for (const t of tasks) await actions.deleteTask(t);
    },

    /** CMD-4: saves the Tasks page's filters under a name, last in the list. */
    async saveView(name: string, filters: SavedViewFields["filters"]) {
      const views = (await db.savedViews.toArray()).filter((v) => !v.deletedAt);
      const order = views.reduce((m, v) => Math.max(m, v.order), 0) + 1;
      return engine.create("savedViews", { name: name.trim().slice(0, 60), filters, order });
    },
    updateView: (id: string, patch: Partial<SavedViewFields>) => engine.update("savedViews", id, patch),
    deleteView: (id: string) => engine.remove("savedViews", id),

    /** NOT-5: marks notifications read (all unread ones when no ids are given). */
    async markNotificationsRead(ids?: string[]) {
      const at = now();
      const rows = ids
        ? (await db.notifications.bulkGet(ids)).filter((n) => n != null)
        : await db.notifications.filter((n) => !n.deletedAt && n.readAt == null).toArray();
      for (const n of rows) if (n.readAt == null) await engine.update("notifications", n.id, { readAt: at });
    },

    async deleteTask(task: Task) {
      for (const sub of await db.tasks.where("parentTaskId").equals(task.id).toArray()) {
        await engine.remove("tasks", sub.id);
      }
      // Its time blocks go too (and come off the calendar).
      for (const b of await db.timeBlocks.where("taskId").equals(task.id).toArray()) {
        if (!b.deletedAt) await engine.remove("timeBlocks", b.id);
      }
      await engine.remove("tasks", task.id);
    },

    // ------------------------------------------------------------ money (Phase 5)

    /** The default categories, created once per account with fixed ids (so devices never make two sets). */
    async ensureDefaultCategories() {
      const existing = await db.categories.count();
      if (existing) return;
      for (const [i, p] of CATEGORY_PRESETS.entries()) {
        await engine.create(
          "categories",
          { name: p.name, icon: p.icon, color: p.color, kind: p.kind, archivedAt: null, order: i },
          presetCategoryId(userId, p.slug),
        );
      }
    },
    createCategory: (fields: Partial<CategoryFields> & { name: string }) =>
      engine.create("categories", newCategoryFields(fields)),
    updateCategory: (id: string, patch: Partial<CategoryFields>) => engine.update("categories", id, patch),
    archiveCategory: (id: string, archived: boolean) =>
      engine.update("categories", id, { archivedAt: archived ? now() : null }),

    async createAccount(fields: Partial<AccountFields> & { name: string }) {
      const s = await settings();
      return engine.create("accounts", newAccountFields({ openingDate: today(s.timezone), ...fields }));
    },
    updateAccount: (id: string, patch: Partial<AccountFields>) => engine.update("accounts", id, patch),
    archiveAccount: (id: string, archived: boolean) =>
      engine.update("accounts", id, { archivedAt: archived ? now() : null }),
    /** Deleting an account keeps its transactions, which just lose their account. */
    async deleteAccount(id: string) {
      for (const t of await db.transactions.where("accountId").equals(id).toArray()) {
        if (!t.deletedAt) await engine.update("transactions", t.id, { accountId: null });
      }
      for (const t of await db.transactions.toArray()) {
        if (!t.deletedAt && t.toAccountId === id) await engine.update("transactions", t.id, { toAccountId: null });
      }
      await engine.remove("accounts", id);
    },

    async createTransaction(fields: Partial<TransactionFields> & { amount: number }) {
      const s = await settings();
      return engine.create("transactions", newTransactionFields({ date: today(s.timezone), ...fields }));
    },
    updateTransaction: (id: string, patch: Partial<TransactionFields>) => engine.update("transactions", id, patch),
    deleteTransaction: (id: string) => engine.remove("transactions", id),

    /** 5B: a recurring entry that's due: log it on its day (confirm) or make and delete it (skip). */
    async confirmOccurrence(due: DueOccurrence, skip = false) {
      const existing = await db.transactions.get(due.id);
      if (existing) return;
      await engine.create("transactions", instanceFields(due.template, due.date), due.id);
      if (skip) await engine.remove("transactions", due.id);
    },

    /**
     * Log income from a source: its payment for `month`, or (`extra`) extra money counted for that
     * month. The date can fall in another month (a salary paid early). Into the chosen account, else
     * the first one; under Salary or side income.
     */
    async logIncomeEntry(
      source: Pick<IncomeSource, "id" | "name">,
      entry: {
        month: string;
        date: string;
        amount: number;
        extra?: boolean;
        note?: string;
        accountId?: string | null;
        createdBy?: TransactionFields["createdBy"];
      },
    ) {
      await actions.ensureDefaultCategories();
      const [accounts, categories] = await Promise.all([db.accounts.toArray(), db.categories.toArray()]);
      const account = accounts
        .filter((a) => a.deletedAt == null && a.archivedAt == null)
        .sort((a, b) => a.order - b.order)[0];
      const slug = /salary|wage|pay/i.test(source.name) ? "salary" : "freelance";
      const category =
        categories.find((c) => c.id === presetCategoryId(userId, slug) && c.deletedAt == null) ??
        categories.find((c) => c.kind === "income" && c.deletedAt == null && c.archivedAt == null);
      const label = entry.extra ? `${source.name} (extra)` : source.name;
      return engine.create(
        "transactions",
        newTransactionFields({
          kind: "income",
          amount: entry.amount,
          date: entry.date,
          note: entry.note?.trim() ? `${label} · ${entry.note.trim()}` : label,
          accountId: entry.accountId !== undefined ? entry.accountId : (account?.id ?? null),
          categoryId: category?.id ?? null,
          createdBy: entry.createdBy ?? "user",
        }),
        incomeEntryId(source.id, entry.month, entry.extra),
      );
    },

    // ---- 5H: expected income (kept in settings)
    async setIncome(fields: Omit<IncomeSource, "id"> & { id?: string }) {
      const s = await settings();
      const list = [...(s.money?.incomes ?? [])];
      const norm = (x: string) => x.trim().toLowerCase();
      const at = list.findIndex((i) => (fields.id ? i.id === fields.id : norm(i.name) === norm(fields.name)));
      const row = {
        id: fields.id ?? list[at]?.id ?? incomeId(),
        name: fields.name.trim(),
        amount: fields.amount,
        day: fields.day,
        from: fields.from ?? null,
        until: fields.until ?? null,
      };
      if (at >= 0) list[at] = row;
      else list.push(row);
      await actions.saveSettings({ money: { monthStartDay: s.money?.monthStartDay ?? 1, incomes: list.slice(0, 10) } });
      return row.id;
    },
    async removeIncome(id: string) {
      const s = await settings();
      await actions.saveSettings({
        money: {
          monthStartDay: s.money?.monthStartDay ?? 1,
          incomes: (s.money?.incomes ?? []).filter((i) => i.id !== id),
        },
      });
    },

    // ---- 5C: savings pots (D48)
    createPot: (fields: Partial<PotFields> & { name: string }) => engine.create("savingsPots", newPotFields(fields)),
    updatePot: (id: string, patch: Partial<PotFields>) => engine.update("savingsPots", id, patch),
    getPot: async (id: string) => (await db.savingsPots.get(id)) ?? null,
    archivePot: (id: string, archived: boolean) =>
      engine.update("savingsPots", id, { archivedAt: archived ? now() : null }),
    /** Deleting a pot keeps the money's history; its transfers just lose the pot. */
    async deletePot(id: string) {
      for (const t of await db.transactions.where("potId").equals(id).toArray()) {
        if (!t.deletedAt) await engine.update("transactions", t.id, { potId: null });
      }
      await engine.remove("savingsPots", id);
    },

    /** Money into (or, with `out`, back from) a pot: a transfer that also moves the linked key result. */
    async contributeToPot(
      pot: Pot,
      amount: number,
      opts: { accountId?: string | null; date?: string; out?: boolean; note?: string } = {},
    ) {
      const s = await settings();
      await engine.create(
        "transactions",
        newTransactionFields({
          kind: "transfer",
          amount,
          potId: pot.id,
          accountId: opts.out ? null : (opts.accountId ?? pot.accountId ?? null),
          toAccountId: opts.out ? (opts.accountId ?? pot.accountId ?? null) : null,
          date: opts.date ?? today(s.timezone),
          note: opts.note ?? "",
        }),
      );
      await actions.syncPotKeyResult(pot);
    },

    /** Keeps a pot's key result at the pot's balance (in the currency's major unit). */
    async syncPotKeyResult(pot: Pot) {
      if (!pot.keyResultId) return;
      const kr = await db.keyResults.get(pot.keyResultId);
      if (!kr || kr.deletedAt) return;
      const s = await settings();
      const per = minorPerMajor(s.currency ?? "NGN");
      const balance = potBalance(pot.id, await db.transactions.toArray()) / per;
      if (balance !== kr.current) await actions.checkInKeyResult(kr, balance, null);
    },

    /** Ties a pot to a goal with a money key result ("Save ₦X for …"); the KR follows the balance. */
    async linkPotToGoal(pot: Pot, goalId: string) {
      const s = await settings();
      const currency = s.currency ?? "NGN";
      const per = minorPerMajor(currency);
      const krId = await actions.createKeyResult(goalId, {
        title: `Save ${formatMoney(pot.target, currency, { compact: true })} for ${pot.name}`.slice(0, 200),
        type: "number",
        start: 0,
        target: pot.target / per,
        current: potBalance(pot.id, await db.transactions.toArray()) / per,
        unit: currency,
      });
      await engine.update("savingsPots", pot.id, { goalId, keyResultId: krId });
    },

    /** A new goal in the Finance area for this pot, then linked. Returns the goal id. */
    async makePotGoal(pot: Pot) {
      await actions.ensurePresetAreas(["finance"]);
      const goalId = await actions.createGoal({
        title: pot.name,
        areaId: presetAreaId(userId, "finance"),
        targetDate: pot.targetDate,
        status: "active",
      });
      await actions.linkPotToGoal(pot, goalId);
      return goalId;
    },

    async unlinkPot(pot: Pot) {
      if (pot.keyResultId) {
        const kr = await db.keyResults.get(pot.keyResultId);
        if (kr && !kr.deletedAt) await engine.remove("keyResults", kr.id);
      }
      await engine.update("savingsPots", pot.id, { goalId: null, keyResultId: null });
    },

    // ---- 5D: debts (D51)
    async createDebt(fields: Partial<DebtFields> & { name: string; principal: number }) {
      const s = await settings();
      return engine.create("debts", newDebtFields({ startDate: today(s.timezone), ...fields }));
    },
    updateDebt: (id: string, patch: Partial<DebtFields>) => engine.update("debts", id, patch),
    getDebt: async (id: string) => (await db.debts.get(id)) ?? null,
    archiveDebt: (id: string, archived: boolean) => engine.update("debts", id, { archivedAt: archived ? now() : null }),
    /** Deleting a debt keeps its payments, which just lose the debt. */
    async deleteDebt(id: string) {
      for (const t of await db.transactions.where("debtId").equals(id).toArray()) {
        if (!t.deletedAt) await engine.update("transactions", t.id, { debtId: null });
      }
      await engine.remove("debts", id);
    },

    /**
     * A payment: money out of an account for one you owe, into an account for one owed to you.
     * Closes the debt when it reaches zero, keeps a linked key result in step, and notes a
     * settlement with the person involved.
     */
    async payDebt(debt: Debt, amount: number, opts: { accountId?: string | null; date?: string; note?: string } = {}) {
      const s = await settings();
      const date = opts.date ?? today(s.timezone);
      const account = opts.accountId ?? debt.accountId ?? null;
      await engine.create(
        "transactions",
        newTransactionFields({
          kind: "transfer",
          amount,
          debtId: debt.id,
          accountId: debt.direction === "owe" ? account : null,
          toAccountId: debt.direction === "owed" ? account : null,
          date,
          note: opts.note ?? "",
        }),
      );
      const state = debtState(debt, await db.transactions.toArray(), date);
      if (state.balance <= 0 && !debt.closedAt) {
        await engine.update("debts", debt.id, { closedAt: now() });
        if (debt.personId) {
          await actions.logInteraction(debt.personId, {
            date,
            type: "other",
            notes: debt.direction === "owe" ? `Paid back ${debt.name} in full.` : `${debt.name}: paid back in full.`,
          });
        }
      }
      await actions.syncDebtKeyResult(debt);
    },

    /** The linked key result counts what's been paid (major units), with the principal as its target. */
    async syncDebtKeyResult(debt: Debt) {
      if (!debt.keyResultId) return;
      const kr = await db.keyResults.get(debt.keyResultId);
      if (!kr || kr.deletedAt) return;
      const s = await settings();
      const per = minorPerMajor(s.currency ?? "NGN");
      const state = debtState(debt, await db.transactions.toArray(), today(s.timezone));
      const value = Math.min(kr.target, state.paid / per);
      if (value !== kr.current) await actions.checkInKeyResult(kr, value, null);
    },

    async linkDebtToGoal(debt: Debt, goalId: string) {
      const s = await settings();
      const currency = s.currency ?? "NGN";
      const per = minorPerMajor(currency);
      const state = debtState(debt, await db.transactions.toArray(), today(s.timezone));
      const krId = await actions.createKeyResult(goalId, {
        title: `Clear ${debt.name} (${formatMoney(debt.principal, currency, { compact: true })})`.slice(0, 200),
        type: "number",
        start: 0,
        target: debt.principal / per,
        current: Math.min(debt.principal, state.paid) / per,
        unit: currency,
      });
      await engine.update("debts", debt.id, { goalId, keyResultId: krId });
    },

    async makeDebtGoal(debt: Debt) {
      await actions.ensurePresetAreas(["finance"]);
      const goalId = await actions.createGoal({
        title: `Clear ${debt.name}`.slice(0, 200),
        areaId: presetAreaId(userId, "finance"),
        status: "active",
      });
      await actions.linkDebtToGoal(debt, goalId);
      return goalId;
    },

    async unlinkDebt(debt: Debt) {
      if (debt.keyResultId) {
        const kr = await db.keyResults.get(debt.keyResultId);
        if (kr && !kr.deletedAt) await engine.remove("keyResults", kr.id);
      }
      await engine.update("debts", debt.id, { goalId: null, keyResultId: null });
    },

    // ---- 5E: holdings (D49)
    createHolding: (fields: Partial<HoldingFields> & { name: string }) =>
      engine.create("holdings", newHoldingFields(fields)),
    updateHolding: (id: string, patch: Partial<HoldingFields>) => engine.update("holdings", id, patch),
    archiveHolding: (id: string, archived: boolean) =>
      engine.update("holdings", id, { archivedAt: archived ? now() : null }),
    async deleteHolding(id: string) {
      for (const v of await db.holdingValues.where("holdingId").equals(id).toArray()) {
        if (!v.deletedAt) await engine.remove("holdingValues", v.id);
      }
      await engine.remove("holdings", id);
    },
    /** A hand-valued holding's value today, kept for the net worth chart as this month's value. */
    async setHoldingValue(id: string, manualValue: number) {
      await engine.update("holdings", id, { manualValue });
      const s = await settings();
      const month = today(s.timezone).slice(0, 7);
      const vid = holdingValueId(id, month);
      const existing = await db.holdingValues.get(vid);
      if (existing && !existing.deletedAt) await engine.update("holdingValues", vid, { value: manualValue });
      else await engine.create("holdingValues", { holdingId: id, month, value: manualValue }, vid);
    },

    /** 5C: rows from a statement, skipping any whose hash is already here. Returns how many were added. */
    async importTransactions(rows: ImportRow[]) {
      const existing = new Set((await db.transactions.toArray()).map((t) => t.importHash).filter(Boolean));
      let added = 0;
      for (const r of rows) {
        if (existing.has(r.hash)) continue;
        await engine.create("transactions", newTransactionFields(importFields(r)));
        existing.add(r.hash);
        added++;
      }
      return added;
    },

    /** 5B: set (or clear, with 0) the budget for a category in a month ("*" for every month). */
    async setBudget(month: string, categoryId: string | null, amount: number) {
      const id = budgetId(userId, month, categoryId);
      const existing = await db.budgets.get(id);
      if (!amount) {
        if (existing && !existing.deletedAt) await engine.remove("budgets", id);
        return;
      }
      if (existing && !existing.deletedAt) await engine.update("budgets", id, { amount });
      else await engine.create("budgets", { month, categoryId, amount }, id);
    },
  };
  return actions;
}
