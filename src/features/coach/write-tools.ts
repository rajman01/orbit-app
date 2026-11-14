import type { z } from "zod";
import { createActions, type Actions } from "@/features/actions";
import { defaultSettings, settingsId, type Settings } from "@/features/settings/model";
import { withTaskDefaults } from "@/features/tasks/model";
import { dayLabel, instantAt, today as todayOf } from "@/lib/dates";
import type { OrbitDB } from "@/lib/local-db/db";
import type { SyncEngine } from "@/lib/sync/engine";
import { recordingEngine, undoChanges, type Change } from "./record";
import { BULK_LIMIT, COACH_TOOLS } from "./tools";

/**
 * The coach's write tools (PRD §10.2) and the rules around them (§10.5): every change is recorded
 * with before/after snapshots as an `aiActions` entry; "Suggest only" turns changes into cards the
 * user accepts; dropping a goal or a burst of more than BULK_LIMIT changes always asks first.
 */

export type WriteToolName =
  | "create_goal"
  | "update_goal"
  | "add_key_result"
  | "checkin_key_result"
  | "add_milestone"
  | "create_task"
  | "update_task"
  | "complete_task"
  | "reschedule_task"
  | "create_habit"
  | "update_habit"
  | "create_reminder"
  | "cancel_reminder"
  | "propose_plan"
  | "break_down_task"
  | "plan_cycle"
  | "set_must_dos"
  | "complete_ritual";

type Input<N extends WriteToolName> = z.infer<(typeof COACH_TOOLS)[N]["input"]>;

export interface WriteDeps {
  engine: SyncEngine;
  db: OrbitDB;
  userId: string;
  now: number;
  threadId?: string | null;
  toolUseId?: string | null;
  /** Changes made so far in this reply (for the bulk limit). */
  turn?: { writes: number };
}

async function loadSettings(db: OrbitDB, userId: string): Promise<Settings> {
  return { ...defaultSettings(), ...((await db.settings.get(settingsId(userId))) ?? {}) };
}

const q = (s: string | undefined | null) => `“${(s ?? "").length > 60 ? `${s!.slice(0, 57)}…` : (s ?? "")}”`;

async function titleOf(db: OrbitDB, entity: "tasks" | "goals" | "habits" | "keyResults" | "reminders", id: string) {
  const doc = (await db.table(entity).get(id)) as { title?: string; name?: string } | undefined;
  return doc?.title ?? doc?.name ?? "it";
}

/** A one-line, plain description of what a tool call does, for cards and the activity feed. */
export async function describeWrite(name: WriteToolName, input: Record<string, unknown>, db: OrbitDB, userId: string) {
  const i = input as Record<string, never>;
  switch (name) {
    case "create_goal":
      return `Create goal ${q(i.title)}`;
    case "update_goal": {
      const t = q(await titleOf(db, "goals", i.id));
      if (i.status === "dropped") return `Drop goal ${t}`;
      if (i.status === "completed") return `Complete goal ${t}`;
      return `Update goal ${t}`;
    }
    case "add_key_result":
      return `Add key result ${q(i.title)}`;
    case "checkin_key_result":
      return `Check in ${q(await titleOf(db, "keyResults", i.id))}: ${i.value}`;
    case "add_milestone":
      return `Add milestone ${q(i.title)}`;
    case "create_task":
      return `${i.parentTaskId ? "Add step" : "Create task"} ${q(i.title)}`;
    case "update_task":
      return `Update ${q(await titleOf(db, "tasks", i.id))}`;
    case "complete_task":
      return `Complete ${q(await titleOf(db, "tasks", i.id))}`;
    case "reschedule_task": {
      const s = await loadSettings(db, userId);
      const t = q(await titleOf(db, "tasks", i.id));
      return i.to ? `Move ${t} to ${dayLabel(i.to, todayOf(s.timezone)).toLowerCase()}` : `Take ${t} off the plan`;
    }
    case "create_habit":
      return `Create habit ${q(i.name)}`;
    case "update_habit":
      return `${(i.archived as unknown) === true ? "Archive" : "Update"} habit ${q(await titleOf(db, "habits", i.id))}`;
    case "create_reminder": {
      const s = await loadSettings(db, userId);
      return `Remind you ${dayLabel(i.date, todayOf(s.timezone)).toLowerCase()} at ${i.time}: ${q(i.title)}`;
    }
    case "cancel_reminder":
      return `Cancel reminder ${q(await titleOf(db, "reminders", i.id))}`;
    case "propose_plan": {
      const p = input as Input<"propose_plan">;
      const title = p.goal?.title ?? (p.goalId ? await titleOf(db, "goals", p.goalId) : "a goal");
      const ms = p.milestones?.length ?? 0;
      const tasks = (p.tasks?.length ?? 0) + (p.milestones ?? []).reduce((n, m) => n + (m.tasks?.length ?? 0), 0);
      const parts = [
        ms && `${ms} milestone${ms === 1 ? "" : "s"}`,
        tasks && `${tasks} task${tasks === 1 ? "" : "s"}`,
      ].filter(Boolean);
      return `Plan for ${q(title)}${parts.length ? `: ${parts.join(", ")}` : ""}`;
    }
    case "break_down_task": {
      const p = input as Input<"break_down_task">;
      return `Break ${q(await titleOf(db, "tasks", p.id))} into ${p.steps.length} step${p.steps.length === 1 ? "" : "s"}`;
    }
    case "plan_cycle": {
      const p = input as Input<"plan_cycle">;
      const add = p.addTaskIds?.length ?? 0;
      const remove = p.removeTaskIds?.length ?? 0;
      const parts = [
        add && `add ${add} task${add === 1 ? "" : "s"}`,
        remove && `take out ${remove}`,
        p.theme && `theme ${q(p.theme)}`,
      ].filter(Boolean);
      return `Cycle ${p.cycleNumber}: ${parts.join(", ") || "set focus goals"}`;
    }
    case "set_must_dos": {
      const ids = (input as Input<"set_must_dos">).taskIds;
      if (!ids.length) return "Clear today's Must-dos";
      const titles = await Promise.all(ids.map((id) => titleOf(db, "tasks", id)));
      return `Must-dos today: ${titles.map((t) => q(t)).join(", ")}`;
    }
    case "complete_ritual":
      return (input as Input<"complete_ritual">).type === "daily_plan"
        ? "Finish today's Daily Plan"
        : "Close the day (Shutdown)";
  }
}

/** Today's day for the user. */
async function todayFor(db: OrbitDB, userId: string, now: number) {
  return todayOf((await loadSettings(db, userId)).timezone, now);
}

/** How many documents a call will create or change, for the bulk limit. */
function size(name: WriteToolName, input: Record<string, unknown>): number {
  if (name === "plan_cycle") {
    const p = input as Input<"plan_cycle">;
    return (p.addTaskIds?.length ?? 0) + (p.removeTaskIds?.length ?? 0);
  }
  if (name === "break_down_task") return (input as Input<"break_down_task">).steps.length;
  return 1;
}

/** Runs the tool with actions that write through the recorder. Returns what to tell the model. */
async function perform(name: WriteToolName, input: Record<string, unknown>, actions: Actions, deps: WriteDeps) {
  const { db, userId } = deps;
  const task = async (id: string) => {
    const t = await db.tasks.get(id);
    if (!t || t.deletedAt != null) throw new Error("No such task.");
    return withTaskDefaults(t);
  };
  const goal = async (id: string) => {
    const g = await db.goals.get(id);
    if (!g || g.deletedAt != null) throw new Error("No such goal.");
    return g;
  };
  switch (name) {
    case "create_goal": {
      const i = input as Input<"create_goal">;
      const id = await actions.createGoal({ status: "active", ...stripUndefined(i) });
      return { id };
    }
    case "update_goal": {
      const { id, status, ...rest } = input as Input<"update_goal">;
      await goal(id);
      if (Object.keys(stripUndefined(rest)).length) await actions.updateGoal(id, stripUndefined(rest));
      if (status === "completed") await actions.completeGoal(id);
      else if (status === "dropped") await actions.dropGoal(id, rest.droppedReason ?? "Dropped with the coach");
      else if (status) await actions.updateGoal(id, { status });
      return { id };
    }
    case "add_key_result": {
      const i = input as Input<"add_key_result">;
      await goal(i.goalId);
      const id = await actions.createKeyResult(i.goalId, {
        title: i.title,
        type: i.type,
        start: i.start ?? 0,
        target: i.target,
        unit: i.unit ?? null,
      });
      return { id };
    }
    case "checkin_key_result": {
      const i = input as Input<"checkin_key_result">;
      const kr = await db.keyResults.get(i.id);
      if (!kr || kr.deletedAt != null) throw new Error("No such key result.");
      await actions.checkInKeyResult(kr, i.value, i.note ?? null);
      return { id: i.id };
    }
    case "add_milestone": {
      const i = input as Input<"add_milestone">;
      await goal(i.goalId);
      return { id: await actions.createMilestone(i.goalId, i.title, i.dueDate ?? null) };
    }
    case "create_task": {
      const i = input as Input<"create_task">;
      if (i.parentTaskId) await task(i.parentTaskId);
      const id = await actions.createTask({ status: "todo", ...stripUndefined(i) });
      const t = await db.tasks.get(id);
      return { id, number: t?.number };
    }
    case "update_task": {
      const { id, ...patch } = input as Input<"update_task">;
      await actions.updateTask(await task(id), stripUndefined(patch));
      return { id };
    }
    case "complete_task": {
      const { id } = input as Input<"complete_task">;
      await actions.setTaskDone(await task(id), true);
      return { id };
    }
    case "reschedule_task": {
      const i = input as Input<"reschedule_task">;
      const s = await loadSettings(db, userId);
      await actions.skipTask(await task(i.id), {
        reason: i.reason ?? null,
        reasonText: i.reasonText ?? null,
        to: i.to,
        todayDay: todayOf(s.timezone, deps.now),
      });
      return { id: i.id };
    }
    case "create_habit": {
      const i = input as Input<"create_habit">;
      return { id: await actions.createHabit(stripUndefined(i)) };
    }
    case "update_habit": {
      const { id, archived, ...patch } = input as Input<"update_habit">;
      const h = await db.habits.get(id);
      if (!h || h.deletedAt != null) throw new Error("No such habit.");
      if (Object.keys(stripUndefined(patch)).length) await actions.updateHabit(id, stripUndefined(patch));
      if (archived !== undefined) await actions.archiveHabit(id, archived);
      return { id };
    }
    case "create_reminder": {
      const i = input as Input<"create_reminder">;
      const s = await loadSettings(db, userId);
      const fireAt = instantAt(i.date, i.time, s.timezone);
      if (fireAt < deps.now - 60_000) throw new Error("That time has already passed.");
      const id = `rc${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 34);
      await actions.scheduleReminder(id, {
        kind: "custom",
        title: i.title,
        body: i.body ?? "",
        url: "/today",
        fireAt,
      });
      return { id, fireAt: new Date(fireAt).toISOString() };
    }
    case "cancel_reminder": {
      const { id } = input as Input<"cancel_reminder">;
      const r = await db.reminders.get(id);
      if (!r || r.deletedAt != null) throw new Error("No such reminder.");
      await actions.cancelReminder(id);
      return { id };
    }
    case "propose_plan": {
      const p = input as Input<"propose_plan">;
      let goalId = p.goalId;
      if (goalId) await goal(goalId);
      else if (p.goal) goalId = await actions.createGoal({ status: "active", ...stripUndefined(p.goal) });
      else throw new Error("A plan needs a goal.");
      const areaId = (await goal(goalId)).areaId;
      for (const kr of p.keyResults ?? []) {
        await actions.createKeyResult(goalId, {
          title: kr.title,
          type: kr.type,
          start: kr.start ?? 0,
          target: kr.target,
          unit: kr.unit ?? null,
        });
      }
      let created = 0;
      const addTask = async (
        t: Input<"propose_plan">["tasks"] extends (infer T)[] | undefined ? T : never,
        milestoneId: string | null,
      ) => {
        await actions.createTask({ status: "todo", ...stripUndefined(t), goalId, milestoneId, areaId });
        created++;
      };
      for (const m of p.milestones ?? []) {
        const milestoneId = await actions.createMilestone(goalId, m.title, m.dueDate ?? null);
        for (const t of m.tasks ?? []) await addTask(t, milestoneId);
      }
      for (const t of p.tasks ?? []) await addTask(t, null);
      return { goalId, milestones: p.milestones?.length ?? 0, tasks: created };
    }
    case "break_down_task": {
      const p = input as Input<"break_down_task">;
      const parent = await task(p.id);
      for (const title of p.steps) {
        await actions.createTask({
          title,
          parentTaskId: parent.id,
          status: "todo",
          areaId: parent.areaId,
          goalId: parent.goalId,
        });
      }
      if (p.nextStep) await actions.updateTask(await task(p.id), { nextStep: p.nextStep });
      return { id: p.id, steps: p.steps.length };
    }
    case "plan_cycle": {
      const p = input as Input<"plan_cycle">;
      const cycle = (await db.cycles.toArray()).find((c) => c.number === p.cycleNumber && c.deletedAt == null);
      if (!cycle) throw new Error(`No cycle ${p.cycleNumber}.`);
      for (const id of p.addTaskIds ?? []) await actions.addToCycle(await task(id), cycle);
      for (const id of p.removeTaskIds ?? []) await actions.removeFromCycle(await task(id));
      const patch = stripUndefined({ theme: p.theme, focusGoalIds: p.focusGoalIds });
      if (Object.keys(patch).length) await actions.updateCycle(cycle.id, patch);
      return { cycle: cycle.number, added: p.addTaskIds?.length ?? 0, removed: p.removeTaskIds?.length ?? 0 };
    }
    case "set_must_dos": {
      const { taskIds } = input as Input<"set_must_dos">;
      const day = await todayFor(db, userId, deps.now);
      const chosen = new Set(taskIds);
      for (const t of (await db.tasks.toArray()).filter((x) => x.mustDoDate === day && x.deletedAt == null)) {
        if (!chosen.has(t.id)) await actions.setMustDo(withTaskDefaults(t), day, false);
      }
      for (const id of taskIds) {
        const t = await task(id);
        if (t.mustDoDate !== day) await actions.setMustDo(t, day, true);
      }
      return { day, mustDos: taskIds };
    }
    case "complete_ritual": {
      const p = input as Input<"complete_ritual">;
      const day = await todayFor(db, userId, deps.now);
      const id = await actions.startRitual(p.type, day);
      const r = await db.rituals.get(id);
      if (r?.completedAt) return { already: "done today" };
      if (p.type === "daily_plan") {
        const mustDos = (await db.tasks.toArray())
          .filter((t) => t.deletedAt == null && t.mustDoDate === day)
          .map((t) => t.id);
        await actions.completeRitual(id, { mustDos, viaCoach: true });
      } else {
        const planned = (await db.tasks.toArray()).filter(
          (t) =>
            t.deletedAt == null &&
            !t.parentTaskId &&
            (t.mustDoDate === day || t.scheduledDate === day || t.dueDate === day),
        );
        await actions.completeRitual(id, {
          note: p.note ?? "",
          wins: p.wins ?? [],
          done: planned.filter((t) => t.status === "done").length,
          planned: planned.length,
          viaCoach: true,
        });
      }
      return { completed: p.type };
    }
  }
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Applies one write and records it. Throws if the action fails (nothing is recorded then). */
export async function applyWrite(name: WriteToolName, input: Record<string, unknown>, deps: WriteDeps) {
  const rec = recordingEngine(deps.engine);
  const actions = createActions(rec.engine, deps.userId);
  const result = await perform(name, input, actions, deps);
  return { result, changes: rec.changes };
}

/**
 * Runs a write tool under the autonomy rules. Returns the text the model gets back, and the
 * `aiActions` entry that the chat shows as a card.
 */
export async function runWriteTool(name: WriteToolName, input: Record<string, unknown>, deps: WriteDeps) {
  const { engine, db, userId } = deps;
  const s = await loadSettings(db, userId);
  const autonomy = s.aiAutonomy ?? "act_tell";
  const summary = await describeWrite(name, input, db, userId);
  const turn = deps.turn ?? { writes: 0 };
  const dropping = name === "update_goal" && input.status === "dropped";
  const bulk = turn.writes + size(name, input) > BULK_LIMIT;
  // A plan is always previewed first: it's many changes, and the user should shape it.
  const plan = name === "propose_plan";
  const base = {
    threadId: deps.threadId ?? null,
    toolUseId: deps.toolUseId ?? null,
    tool: name,
    input,
    summary,
    at: deps.now,
    undoneAt: null,
  };

  if (autonomy === "suggest" || dropping || bulk || plan) {
    const actionId = await engine.create("aiActions", { ...base, status: "proposed", changes: [] });
    if (plan) {
      return {
        actionId,
        content: `Shown to them as a plan preview (“${summary}”): they can edit it, then Apply or Dismiss. Nothing is created until they apply it. Point them to the preview; don't repeat the whole plan.`,
      };
    }
    const why =
      autonomy === "suggest"
        ? "Their settings say suggest only"
        : dropping
          ? "Dropping a goal always needs their OK"
          : `More than ${BULK_LIMIT} changes in one go need their OK`;
    return {
      actionId,
      content: `Not done yet: shown to them as a suggestion (“${summary}”) with Accept and Dismiss. ${why}. Tell them briefly what you suggested; don't repeat it as done.`,
    };
  }

  const { result, changes } = await applyWrite(name, input, deps);
  turn.writes += size(name, input);
  const actionId = await engine.create("aiActions", { ...base, status: "applied", changes: changes as never });
  return { actionId, content: JSON.stringify({ done: summary, ...result }) };
}

/** The user accepted a suggestion: apply it now and record the changes. */
export async function acceptProposal(
  actionId: string,
  deps: Omit<WriteDeps, "toolUseId" | "threadId">,
  /** The suggestion as the user edited it (a plan preview). */
  edited?: Record<string, unknown>,
) {
  const a = await deps.db.aiActions.get(actionId);
  if (!a || a.status !== "proposed") return;
  const tool = a.tool as WriteToolName;
  let input = a.input;
  if (edited) {
    const parsed = COACH_TOOLS[tool].input.safeParse(edited);
    if (!parsed.success) throw new Error("Something in the plan isn't valid (an empty title?).");
    input = parsed.data as Record<string, unknown>;
  }
  const { changes } = await applyWrite(tool, input, deps);
  const summary = edited ? await describeWrite(tool, input, deps.db, deps.userId) : a.summary;
  await deps.engine.update("aiActions", actionId, {
    status: "applied",
    changes: changes as never,
    input,
    summary,
    at: Date.now(),
  });
}

export const dismissProposal = (engine: SyncEngine, actionId: string) =>
  engine.update("aiActions", actionId, { status: "dismissed" });

/** Undo (PRD §10.5): takes back everything that action changed. */
export async function undoAction(engine: SyncEngine, actionId: string) {
  const a = await engine.db.aiActions.get(actionId);
  if (!a || a.status !== "applied") return;
  await undoChanges(engine, a.changes as Change[]);
  await engine.update("aiActions", actionId, { status: "undone", undoneAt: Date.now() });
}

export const UNDO_DAYS = 30;
