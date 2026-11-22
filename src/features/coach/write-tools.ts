import type { z } from "zod";
import { createActions, type Actions } from "@/features/actions";
import { defaultSettings, settingsId, type Settings } from "@/features/settings/model";
import { withTaskDefaults } from "@/features/tasks/model";
import { wouldLoop } from "@/features/tasks/links";
import { careerProfileId } from "@/features/jobs/model";
import { dayLabel, dayOf, instantAt, timeOf, today as todayOf } from "@/lib/dates";
import type { OrbitDB } from "@/lib/local-db/db";
import type { SyncEngine } from "@/lib/sync/engine";
import { recordingEngine, undoChanges, type Change } from "./record";
import { BULK_LIMIT, COACH_TOOLS } from "./tools";
import { DEFAULT_CURRENCY, formatMoney, minorPerMajor } from "@/features/money/model";
import { addMonthsToMonth, incomeTimingLabel } from "@/features/money/income";

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
  | "complete_ritual"
  | "create_time_block"
  | "move_time_block"
  | "add_person"
  | "update_person"
  | "log_interaction"
  | "add_person_note"
  | "log_win"
  | "add_goal_update"
  | "log_transaction"
  | "set_budget"
  | "contribute_to_pot"
  | "add_debt"
  | "pay_debt"
  | "set_income"
  | "plan_month"
  | "save_skill"
  | "save_learning_item"
  | "plan_course"
  | "save_job_lead"
  | "create_routine"
  | "make_lead_from_role"
  | "pause_job_search";

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

/** 5F: the model speaks in the main unit; the ledger keeps minor units. */
const toMinor = (major: number, s: Settings) => Math.round(major * minorPerMajor(s.currency ?? DEFAULT_CURRENCY));
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
async function categoryNamed(db: OrbitDB, name: string, kind: "expense" | "income") {
  const rows = (await db.categories.toArray()).filter(
    (c) => c.deletedAt == null && c.archivedAt == null && c.kind === kind,
  );
  return (
    rows.find((c) => norm(c.name) === norm(name)) ??
    rows.find((c) => norm(c.name).startsWith(norm(name))) ??
    rows.find((c) => norm(c.name).includes(norm(name))) ??
    null
  );
}
async function accountNamed(db: OrbitDB, name: string) {
  const rows = (await db.accounts.toArray()).filter((a) => a.deletedAt == null && a.archivedAt == null);
  return rows.find((a) => norm(a.name) === norm(name)) ?? rows.find((a) => norm(a.name).includes(norm(name))) ?? null;
}

const q = (s: string | undefined | null) => `“${(s ?? "").length > 60 ? `${s!.slice(0, 57)}…` : (s ?? "")}”`;

async function titleOf(
  db: OrbitDB,
  entity: "tasks" | "goals" | "habits" | "keyResults" | "reminders" | "people",
  id: string,
) {
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
    case "create_time_block": {
      const p = input as Input<"create_time_block">;
      const s = await loadSettings(db, userId);
      const title = p.taskId ? await titleOf(db, "tasks", p.taskId) : (p.title ?? "time");
      const end = minutesToTime(timeToMinutes(p.start) + p.minutes);
      return `Block ${p.start}–${end} ${dayLabel(p.date, todayOf(s.timezone)).toLowerCase()} for ${q(title)}`;
    }
    case "move_time_block": {
      const p = input as Input<"move_time_block">;
      const b = await db.timeBlocks.get(p.id);
      const s = await loadSettings(db, userId);
      const to = [p.date ? dayLabel(p.date, todayOf(s.timezone)).toLowerCase() : null, p.start ? `at ${p.start}` : null]
        .filter(Boolean)
        .join(" ");
      return `Move block ${q(b?.title)}${to ? ` to ${to}` : ""}${p.minutes ? ` (${p.minutes} min)` : ""}`;
    }
    case "add_person":
      return `Add ${q(i.name)} to People`;
    case "update_person": {
      const p = input as Input<"update_person">;
      const name = q(await titleOf(db, "people", p.id));
      if (p.archived === true) return `Archive ${name}`;
      if (p.snoozedUntil) {
        const s = await loadSettings(db, userId);
        return `Snooze ${name} until ${dayLabel(p.snoozedUntil, todayOf(s.timezone)).toLowerCase()}`;
      }
      return `Update ${name}`;
    }
    case "log_interaction": {
      const p = input as Input<"log_interaction">;
      const verb = { call: "Call", text: "Message", in_person: "Meeting", other: "Catch-up" }[p.type];
      return `Log: ${verb} with ${q(await titleOf(db, "people", p.personId))}${p.followUp ? `, follow-up ${q(p.followUp.title)}` : ""}`;
    }
    case "log_win":
      return `Log a win: ${q(i.title)}`;
    case "add_goal_update":
      return `Update on ${q(await titleOf(db, "goals", i.goalId))}`;
    case "log_transaction": {
      const p = input as Input<"log_transaction">;
      const s = await loadSettings(db, userId);
      const money = formatMoney(toMinor(p.amount, s), s.currency ?? DEFAULT_CURRENCY);
      return `${p.kind === "income" ? "Log income" : "Log spending"}: ${money}${p.note ? ` · ${p.note}` : p.category ? ` · ${p.category}` : ""}`;
    }
    case "set_budget": {
      const p = input as Input<"set_budget">;
      const s = await loadSettings(db, userId);
      const money = formatMoney(toMinor(p.amount, s), s.currency ?? DEFAULT_CURRENCY, { compact: true });
      return p.amount
        ? `Set the ${p.category ?? "overall"} budget to ${money} a month${p.month ? ` for ${p.month}` : ""}`
        : `Remove the ${p.category ?? "overall"} budget`;
    }
    case "contribute_to_pot": {
      const p = input as Input<"contribute_to_pot">;
      const s = await loadSettings(db, userId);
      const money = formatMoney(toMinor(p.amount, s), s.currency ?? DEFAULT_CURRENCY, { compact: true });
      const pot = await db.savingsPots.get(p.potId);
      return p.out ? `Take ${money} out of ${q(pot?.name)}` : `Put ${money} in ${q(pot?.name)}`;
    }
    case "add_debt": {
      const p = input as Input<"add_debt">;
      const s = await loadSettings(db, userId);
      const money = formatMoney(toMinor(p.principal, s), s.currency ?? DEFAULT_CURRENCY, { compact: true });
      return p.direction === "owe"
        ? `Add a debt: ${q(p.name)} (${money})`
        : `Record money owed to you: ${q(p.name)} (${money})`;
    }
    case "pay_debt": {
      const p = input as Input<"pay_debt">;
      const s = await loadSettings(db, userId);
      const money = formatMoney(toMinor(p.amount, s), s.currency ?? DEFAULT_CURRENCY, { compact: true });
      const debt = await db.debts.get(p.debtId);
      return `Record a ${money} payment on ${q(debt?.name)}`;
    }
    case "set_income": {
      const p = input as Input<"set_income">;
      const s = await loadSettings(db, userId);
      if (!p.amount) return `Remove the income ${q(p.name)}`;
      const t = incomeTiming(p, todayOf(s.timezone).slice(0, 7));
      const once = t.from != null && t.from === t.until;
      const when = incomeTimingLabel(t);
      return `Expect ${formatMoney(toMinor(p.amount, s), s.currency ?? DEFAULT_CURRENCY, { compact: true })}${once ? "" : " a month"} from ${q(p.name)}${when ? ` ${when}` : ""}`;
    }
    case "plan_month": {
      const p = input as Input<"plan_month">;
      const n = (p.budgets?.length ?? 0) + (p.pots?.length ?? 0);
      return `A monthly plan: ${n} budget${n === 1 ? "" : "s"} and pot amount${n === 1 ? "" : "s"}${p.summary ? ` — ${p.summary}` : ""}`;
    }
    case "pause_job_search": {
      const p = input as Input<"pause_job_search">;
      if (p.resume) return "Resume the job search";
      if (p.until) {
        const s = await loadSettings(db, userId);
        return `Pause the job search until ${dayLabel(p.until, todayOf(s.timezone)).toLowerCase()}`;
      }
      return "Pause the job search";
    }
    case "make_lead_from_role": {
      const p = input as Input<"make_lead_from_role">;
      const posting = await db.jobPostings.get(p.postingId);
      return `Make a lead: ${q(posting?.title)}${posting?.company ? ` at ${posting.company}` : ""}`;
    }
    case "create_routine": {
      const p = input as Input<"create_routine">;
      return `Set up the routine ${q(p.name)} (${p.steps.length} step${p.steps.length === 1 ? "" : "s"})`;
    }
    case "save_skill": {
      const p = input as Input<"save_skill">;
      if (!p.id) return `Add the skill ${q(p.name)}`;
      const s = await db.skills.get(p.id);
      if (p.level != null && s && p.level !== s.level) return `${q(s.name)}: level ${s.level} → ${p.level}`;
      return `Update the skill ${q(s?.name ?? p.name)}`;
    }
    case "save_learning_item": {
      const p = input as Input<"save_learning_item">;
      if (!p.id) return `Add to learning: ${q(p.title)}`;
      const l = await db.learningItems.get(p.id);
      const t = q(l?.title ?? p.title);
      if (p.status === "done") return `Finish ${t}`;
      if (p.status === "in_progress" && l?.status === "queued") return `Start ${t}`;
      if (p.progress != null) return `${t}: ${p.progress}%`;
      return `Update ${t}`;
    }
    case "plan_course": {
      const p = input as Input<"plan_course">;
      const s = await loadSettings(db, userId);
      const l = await db.learningItems.get(p.learningItemId);
      return `Plan ${q(l?.title)} to finish ${dayLabel(p.targetDate, todayOf(s.timezone)).toLowerCase()}${p.sections?.length ? ` (${p.sections.length} sections)` : ""}`;
    }
    case "save_job_lead": {
      const p = input as Input<"save_job_lead">;
      if (!p.id) return `Add the lead ${q(p.company)}${p.role ? ` (${p.role})` : ""}`;
      const l = await db.jobLeads.get(p.id);
      const name = q(l?.company ?? p.company);
      if (p.stage && l && p.stage !== l.stage) return `Move ${name} to ${p.stage === "closed" ? "closed" : p.stage}`;
      if (p.nextStep) return `Next step for ${name}: ${q(p.nextStep)}`;
      return `Update ${name}`;
    }
    case "add_person_note": {
      const p = input as Input<"add_person_note">;
      const name = q(await titleOf(db, "people", p.personId));
      return p.kind === "gift" ? `Gift idea for ${name}: ${q(p.text)}` : `Remember about ${name}: ${q(p.text)}`;
    }
  }
}

const timeToMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const minutesToTime = (m: number) =>
  `${String(Math.floor((m / 60) % 24)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
  const person = async (id: string) => {
    const p = await db.people.get(id);
    if (!p || p.deletedAt != null) throw new Error("No such person.");
    return p;
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
      if (patch.blockedBy) {
        const all = (await db.tasks.toArray()).filter((t) => t.deletedAt == null).map(withTaskDefaults);
        for (const b of patch.blockedBy) {
          if (!all.some((t) => t.id === b)) throw new Error("A task in blockedBy doesn't exist.");
          if (wouldLoop(id, b, all)) throw new Error("That would make the tasks wait on each other.");
        }
      }
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
    case "create_time_block": {
      const p = input as Input<"create_time_block">;
      const s = await loadSettings(db, userId);
      const t = p.taskId ? await task(p.taskId) : null;
      const title = t?.title ?? p.title;
      if (!title) throw new Error("Give a taskId or a title.");
      const start = instantAt(p.date, p.start, s.timezone);
      const end = start + p.minutes * 60_000;
      const id = await actions.blockTime({ taskId: t?.id ?? null, title, start, end });
      return { id, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    }
    case "move_time_block": {
      const p = input as Input<"move_time_block">;
      const b = await db.timeBlocks.get(p.id);
      if (!b || b.deletedAt != null) throw new Error("No such time block.");
      const s = await loadSettings(db, userId);
      const date = p.date ?? dayOf(b.start, s.timezone);
      const time = p.start ?? timeOf(b.start, s.timezone);
      const start = instantAt(date, time, s.timezone);
      const end = start + (p.minutes ?? Math.round((b.end - b.start) / 60_000)) * 60_000;
      await actions.moveTimeBlock(b.id, start, end);
      return { id: b.id, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    }
    case "add_person": {
      const { birthday, phone, email, ...p } = input as Input<"add_person">;
      const id = await actions.createPerson({
        ...stripUndefined(p),
        phone: phone || null,
        email: email || null,
        dates: birthday
          ? [{ kind: "birthday", label: "", month: birthday.month, day: birthday.day, year: birthday.year ?? null }]
          : [],
      });
      return { id };
    }
    case "update_person": {
      const { id, birthday, archived, ...rest } = input as Input<"update_person">;
      const p = await person(id);
      const patch: Record<string, unknown> = stripUndefined(rest);
      if (birthday !== undefined) {
        const others = p.dates.filter((d) => d.kind !== "birthday");
        patch.dates = birthday
          ? [
              { kind: "birthday", label: "", month: birthday.month, day: birthday.day, year: birthday.year ?? null },
              ...others,
            ]
          : others;
      }
      if (Object.keys(patch).length) await actions.updatePerson(id, patch);
      if (archived !== undefined) await actions.archivePerson(id, archived);
      return { id };
    }
    case "log_interaction": {
      const p = input as Input<"log_interaction">;
      await person(p.personId);
      const date = p.date ?? (await todayFor(db, userId, deps.now));
      if (date > (await todayFor(db, userId, deps.now)))
        throw new Error("That date is in the future; log it once it has happened.");
      const out = await actions.logInteraction(
        p.personId,
        { date, type: p.type, notes: p.notes ?? "" },
        p.followUp ? { title: p.followUp.title, scheduledDate: p.followUp.scheduledDate ?? null } : null,
      );
      return { id: out.id, followUpTaskId: out.taskId ?? undefined };
    }
    case "add_person_note": {
      const p = input as Input<"add_person_note">;
      await person(p.personId);
      return { id: await actions.addPersonItem(p.personId, p.kind, p.text) };
    }
    case "log_win": {
      const p = input as Input<"log_win">;
      const day = await todayFor(db, userId, deps.now);
      const g = p.goalId ? await goal(p.goalId) : null;
      const id = await actions.createWin({
        title: p.title,
        date: p.date && p.date <= day ? p.date : day,
        description: p.description ?? "",
        impact: p.impact ?? "",
        goalId: g?.id ?? null,
        areaId: g?.areaId ?? null,
        source: "coach",
      });
      return { id };
    }
    case "add_goal_update": {
      const p = input as Input<"add_goal_update">;
      await goal(p.goalId);
      await actions.addGoalUpdate(p.goalId, p.text);
      return { posted: true };
    }
    case "log_transaction": {
      const p = input as Input<"log_transaction">;
      const s = await loadSettings(db, userId);
      // A first-time account has no categories until Money is opened: seed them before looking one up.
      await actions.ensureDefaultCategories();
      const category = p.category ? await categoryNamed(db, p.category, p.kind) : null;
      if (p.category && !category)
        throw new Error(`No category called “${p.category}”. Leave it out, or use one of theirs.`);
      const account = p.account ? await accountNamed(db, p.account) : null;
      if (p.account && !account) throw new Error(`No account called “${p.account}”.`);
      const id = await actions.createTransaction({
        kind: p.kind,
        amount: toMinor(p.amount, s),
        categoryId: category?.id ?? null,
        accountId: account?.id ?? null,
        note: p.note ?? "",
        ...(p.date ? { date: p.date } : {}),
        createdBy: "ai",
      });
      return { transactionId: id, category: category?.name ?? null };
    }
    case "set_budget": {
      const p = input as Input<"set_budget">;
      const s = await loadSettings(db, userId);
      await actions.ensureDefaultCategories();
      const category = p.category ? await categoryNamed(db, p.category, "expense") : null;
      if (p.category && !category) throw new Error(`No spending category called “${p.category}”.`);
      await actions.setBudget(p.month ?? "*", category?.id ?? null, toMinor(p.amount, s));
      return { set: true, category: category?.name ?? "overall" };
    }
    case "contribute_to_pot": {
      const p = input as Input<"contribute_to_pot">;
      const s = await loadSettings(db, userId);
      const pot = await db.savingsPots.get(p.potId);
      if (!pot || pot.deletedAt != null) throw new Error("No such pot.");
      const account = p.account ? await accountNamed(db, p.account) : null;
      await actions.contributeToPot(pot, toMinor(p.amount, s), { out: p.out, accountId: account?.id });
      return { pot: pot.name };
    }
    case "add_debt": {
      const p = input as Input<"add_debt">;
      const s = await loadSettings(db, userId);
      const id = await actions.createDebt({
        name: p.name,
        direction: p.direction,
        kind: p.kind ?? "loan",
        principal: toMinor(p.principal, s),
        interestRate: p.interestRate ?? null,
        minimumPayment: p.minimumPayment != null ? toMinor(p.minimumPayment, s) : null,
        dueDay: p.dueDay ?? null,
      });
      return { debtId: id };
    }
    case "set_income": {
      const p = input as Input<"set_income">;
      const s = await loadSettings(db, userId);
      if (!p.amount) {
        const match = (s.money?.incomes ?? []).find((i) => i.name.trim().toLowerCase() === p.name.trim().toLowerCase());
        if (match) await actions.removeIncome(match.id);
        return { removed: Boolean(match) };
      }
      const id = await actions.setIncome({
        name: p.name,
        amount: toMinor(p.amount, s),
        ...incomeTiming(p, todayOf(s.timezone).slice(0, 7)),
      });
      return { incomeId: id };
    }
    case "plan_month": {
      const p = input as Input<"plan_month">;
      const s = await loadSettings(db, userId);
      await actions.ensureDefaultCategories();
      const set: string[] = [];
      for (const b of p.budgets ?? []) {
        const category = await categoryNamed(db, b.category, "expense");
        if (!category) throw new Error(`No spending category called “${b.category}”.`);
        await actions.setBudget("*", category.id, toMinor(b.amount, s));
        set.push(category.name);
      }
      for (const x of p.pots ?? []) {
        const pot = await db.savingsPots.get(x.potId);
        if (!pot || pot.deletedAt != null) throw new Error("No such pot.");
        await actions.updatePot(pot.id, { monthly: toMinor(x.monthly, s) });
        set.push(pot.name);
      }
      return { set };
    }
    case "pay_debt": {
      const p = input as Input<"pay_debt">;
      const s = await loadSettings(db, userId);
      const debt = await db.debts.get(p.debtId);
      if (!debt || debt.deletedAt != null) throw new Error("No such debt.");
      const account = p.account ? await accountNamed(db, p.account) : null;
      await actions.payDebt(debt, toMinor(p.amount, s), { accountId: account?.id, date: p.date });
      return { debt: debt.name };
    }
    case "pause_job_search": {
      const p = input as Input<"pause_job_search">;
      const profile = await db.careerProfile.get(careerProfileId(userId));
      if (!profile || profile.deletedAt != null) throw new Error("They haven't set up the job assistant yet.");
      if (p.resume) await actions.updateJobSearch({ paused: false, pausedUntil: null });
      else {
        const today = await todayFor(db, userId, deps.now);
        if (p.until && p.until <= today) throw new Error("The date must be after today.");
        await actions.updateJobSearch({ paused: true, pausedUntil: p.until ?? null });
      }
      return { paused: !p.resume, until: p.until ?? null };
    }
    case "make_lead_from_role": {
      const p = input as Input<"make_lead_from_role">;
      const posting = await db.jobPostings.get(p.postingId);
      if (!posting || posting.deletedAt != null) throw new Error("No such found role.");
      const s = await loadSettings(db, userId);
      return { leadId: await actions.postingToLead(posting, todayOf(s.timezone, deps.now)) };
    }
    case "create_routine": {
      const p = input as Input<"create_routine">;
      for (const st of p.steps)
        if (st.habitId && !(await db.habits.get(st.habitId)))
          throw new Error("A step points at a habit that doesn't exist.");
      const id = await actions.createRoutine({
        name: p.name,
        kind: p.kind,
        steps: p.steps.map((st, i) => ({
          id: `s${i + 1}`,
          text: st.text,
          minutes: st.minutes ?? null,
          habitId: st.habitId ?? null,
        })),
        days: p.days ?? [],
        reminderTime: p.reminderTime ?? null,
      });
      return { id };
    }
    case "save_skill": {
      const { id, ...rest } = input as Input<"save_skill">;
      const fields = stripUndefined(rest);
      if (fields.goalId) await goal(fields.goalId);
      if (!id) {
        if (!fields.name) throw new Error("A new skill needs a name.");
        return { id: await actions.createSkill({ ...fields, name: fields.name }) };
      }
      const s = await db.skills.get(id);
      if (!s || s.deletedAt != null) throw new Error("No such skill.");
      await actions.updateSkill(s, fields);
      return { id };
    }
    case "save_learning_item": {
      const { id, ...rest } = input as Input<"save_learning_item">;
      const fields = stripUndefined(rest);
      if (fields.skillId && !(await db.skills.get(fields.skillId))) throw new Error("No such skill.");
      if (!id) {
        if (!fields.title) throw new Error("A new learning item needs a title.");
        return { id: await actions.createLearningItem({ ...fields, title: fields.title }) };
      }
      const l = await db.learningItems.get(id);
      if (!l || l.deletedAt != null) throw new Error("No such learning item.");
      await actions.updateLearningItem(l, fields);
      return { id };
    }
    case "plan_course": {
      const p = input as Input<"plan_course">;
      let item = await db.learningItems.get(p.learningItemId);
      if (!item || item.deletedAt != null) throw new Error("No such learning item.");
      if (p.sections?.length) {
        const kept = (item.sections ?? []).filter((x) => x.doneAt != null);
        const fresh = p.sections.map((x, i) => ({
          id: `s${Date.now().toString(36).slice(-5)}${i.toString(36)}`,
          title: x.title,
          minutes: x.minutes ?? null,
          doneAt: null,
          taskId: null,
        }));
        await actions.setSections(item, [...kept, ...fresh].slice(0, 200));
        item = (await db.learningItems.get(p.learningItemId))!;
      }
      if (!(item.sections ?? []).some((x) => x.doneAt == null))
        throw new Error("It has no sections left to plan; pass its sections.");
      const s = await loadSettings(db, userId);
      const r = await actions.planCourse(
        item,
        { targetDate: p.targetDate, days: p.days ?? [1, 2, 3, 4, 5], minutesPerDay: p.minutesPerDay ?? 60 },
        todayOf(s.timezone, deps.now),
      );
      return { id: item.id, planned: r.days.length, finish: r.finish, late: r.late };
    }
    case "save_job_lead": {
      const { id, stage, outcome, ...rest } = input as Input<"save_job_lead">;
      const fields = stripUndefined(rest);
      if (!id) {
        if (!fields.company) throw new Error("A new lead needs a company.");
        return {
          id: await actions.createJobLead({ ...fields, company: fields.company, stage, outcome: outcome ?? null }),
        };
      }
      const l = await db.jobLeads.get(id);
      if (!l || l.deletedAt != null) throw new Error("No such lead.");
      if (Object.keys(fields).length) await actions.updateJobLead(id, fields);
      if (stage || outcome) await actions.moveJobLead(l, stage ?? l.stage, outcome ?? null);
      return { id };
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
  const plan = name === "propose_plan" || name === "plan_month";
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

/** set_income's day and months, with `payments` turned into the last month. */
function incomeTiming(p: Input<"set_income">, thisMonth: string) {
  const from = p.from ?? (p.payments ? thisMonth : null);
  const until = p.payments && from ? addMonthsToMonth(from, p.payments - 1) : (p.until ?? null);
  return { day: p.day ?? null, from, until };
}
