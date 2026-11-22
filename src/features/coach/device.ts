import type { Actions } from "@/features/actions";
import {
  cyclePoints,
  currentCycle,
  daysLeft,
  planningCandidates,
  planningTarget,
  suggestedCapacity,
  timeOfDay,
} from "@/features/cycles/model";
import { goalProgress } from "@/features/goals/model";
import { habitStatus } from "@/features/habits/model";
import { defaultSettings, settingsId, type Settings } from "@/features/settings/model";
import { isOpen, taskCode, withTaskDefaults, type Task } from "@/features/tasks/model";
import { buildToday, lastTouched, planDay, skipReasonLabel } from "@/features/today/model";
import { pipelineStats, SKILL_LEVELS } from "@/features/career/model";
import { careerProfileId, profileReadiness, searchSettings } from "@/features/jobs/model";
import {
  areaHealth,
  cycleTrend,
  doneByArea,
  focusByWeek,
  headlines,
  insightRange,
  moodVsDone,
  postponementsBeforeDone,
  ritualConsistency,
  skipInsights,
  staleTrend,
  timeVsValues,
  withSuggestedHealth,
} from "@/features/insights/model";
import { levelFromXp, totalXp } from "@/features/xp/model";
import { addDays, dayOf, longDayLabel, timeOf, today as todayOf } from "@/lib/dates";
import { dayFit, onDay, spanMinutes } from "@/features/calendar/model";
import {
  elapsedShare,
  pace,
  quarterDates,
  quarterDaysLeft,
  quarterId,
  quarterLabel,
  quarterOf,
  visionId,
  yearTheme,
} from "@/features/quarters/model";
import {
  agoLabel,
  cadenceLabel,
  dateTitle,
  formatPersonDate,
  lastInTouch,
  reachOut,
  RELATIONSHIP_META,
  upcomingDate,
  upcomingDates,
} from "@/features/people/model";
import type { OrbitDB } from "@/lib/local-db/db";
import { coursePace } from "@/features/career/course";
import type { CoachMessage } from "./protocol";
import { SUBJECT_LABEL, type CoachSubject } from "./subject";
import { budgetStatuses, PACE_LABEL } from "@/features/money/budgets";
import { debtState, payoffPlan, suggestedMonthly, DEBT_KIND_LABEL } from "@/features/money/debts";
import { allocation, HOLDING_TYPE_LABEL, holdingSummary, netWorth } from "@/features/money/holdings";
import {
  DEFAULT_CURRENCY,
  minorPerMajor,
  monthOf,
  monthSummary,
  spendByCategory,
  transactionLabel,
} from "@/features/money/model";
import { potProjection } from "@/features/money/pots";
import { incomeByMonth, monthPlan } from "@/features/money/plan";
import { COACH_TOOLS, isCoachTool, WRITE_TOOLS } from "./tools";
import { runWriteTool, type WriteDeps, type WriteToolName } from "./write-tools";

/**
 * The device half of the coach: it builds each turn's context and runs the tools the model asks
 * for against the local database, with the same actions as the UI (docs/phases/phase-2a.md, decision 2).
 */

interface Deps extends WriteDeps {
  actions: Actions;
}

const live = <T extends { deletedAt: number | null }>(rows: T[]) => rows.filter((r) => r.deletedAt == null);
const major = (minor: number, currency: string) => Math.round((minor / minorPerMajor(currency)) * 100) / 100;

async function loadSettings(db: OrbitDB, userId: string): Promise<Settings> {
  return { ...defaultSettings(), ...((await db.settings.get(settingsId(userId))) ?? {}) };
}

async function allTasks(db: OrbitDB): Promise<Task[]> {
  return live(await db.tasks.toArray()).map(withTaskDefaults);
}

/** A task as the model sees it: small, with the fields that matter for coaching. */
function taskBrief(t: Task) {
  return {
    id: t.id,
    code: taskCode(t),
    title: t.title,
    status: t.status,
    priority: t.priority === "none" ? undefined : t.priority,
    effort: t.effort ?? undefined,
    due: t.dueDate ?? undefined,
    scheduled: t.scheduledDate ?? undefined,
    nextStep: t.nextStep ?? undefined,
    postponed: t.postponeCount ? t.postponeCount : undefined,
  };
}

/** The per-turn context sent as a system message after each user message (date, time, memories). */
export async function coachContext(
  db: OrbitDB,
  userId: string,
  now: number,
  subject?: CoachSubject | null,
): Promise<string> {
  const s = await loadSettings(db, userId);
  const day = todayOf(s.timezone, now);
  const memories = live(await db.aiMemories.toArray()).filter((m) => m.archivedAt == null);
  const vision = await db.vision.get(visionId(userId));
  const theme = vision && !vision.deletedAt ? yearTheme(vision, Number(day.slice(0, 4))) : "";
  const values = vision && !vision.deletedAt ? vision.values : [];
  const lines = [
    `Now: ${longDayLabel(day)} ${day}, ${timeOfDay(now, s.timezone)} (${s.timezone}).`,
    `Settings: cycles of ${s.cycleLengthDays} days, daily capacity ${s.dailyCapacityPts} pts, strictness ${s.strictness}.`,
    `Coach autonomy: ${AUTONOMY_TEXT[s.aiAutonomy ?? "act_tell"]}`,
    ...(await moneyLine(db, s, now)),
    ...(theme ? [`Their theme for ${day.slice(0, 4)}: "${theme}".`] : []),
    ...(values.length
      ? [`Their values: ${values.map((v) => (v.description ? `${v.name} (${v.description})` : v.name)).join("; ")}.`]
      : []),
    memories.length
      ? `What you remember about them:\n${memories.map((m) => `- [${m.id}] ${m.text}`).join("\n")}`
      : "You have no saved notes about them yet.",
  ];
  if (subject) lines.push("", await subjectContext(db, userId, now, subject));
  return lines.join("\n");
}

/** How the coach keeps what it makes attached to the item. */
const SUBJECT_LINKS: Record<CoachSubject["kind"], (id: string) => string> = {
  goal: (id) =>
    `New tasks, milestones, key results, updates and wins for it go on this goal (goalId ${id}); a plan for it goes through propose_plan with this goal.`,
  task: (id) =>
    `Steps go on this task with break_down_task (id ${id}); its next step, dates and priority with update_task; when it's done, complete_task.`,
  job: (id) =>
    `Keep this lead's stage, next step and date current with save_job_lead (id ${id}); prep work can be tasks with a scheduled day. The tailored CV and letter come from "Prepare application" on the lead's page.`,
  course: (id) =>
    `Plan or re-plan it with plan_course (learningItemId ${id}); study sessions are its section tasks. Raise the linked skill's level only when they describe real growth.`,
  pot: (id) =>
    `Money they put in goes through contribute_to_pot (potId ${id}); the wider picture is in get_money. Saving more usually means spending less somewhere: look at their budgets and categories before suggesting where.`,
  debt: (id) =>
    `Payments go through pay_debt (debtId ${id}); the clearing order and timing come from get_payoff_plan. Explain interest and the plan plainly; never advise borrowing to invest or similar.`,
};

/**
 * Phase 3H: the part of the per-turn context for a conversation about one item: what to focus on,
 * and the item as it is now (so the coach never works from an old picture of it).
 */
export async function subjectContext(db: OrbitDB, userId: string, now: number, subject: CoachSubject) {
  const facts = await subjectFacts(db, userId, now, subject);
  const kind = SUBJECT_LABEL[subject.kind].toLowerCase();
  if (typeof facts === "string") {
    return `This conversation was about one ${kind}, but it ${facts} Tell them, and help with whatever they need now.`;
  }
  return [
    `This conversation is about one ${kind}: “${facts.title}” (id ${subject.id}). Your job here is to help them get it done.`,
    `- Stay on it. If they raise something else, help briefly, then bring it back.`,
    `- Its details below are current, so trust them over anything said earlier in this conversation.`,
    `- Move it forward: find what's blocking it, make the next step small and concrete, and agree when they'll do it.`,
    `- ${SUBJECT_LINKS[subject.kind](subject.id)}`,
    `Details: ${JSON.stringify(facts.details)}`,
  ].join("\n");
}

async function subjectFacts(
  db: OrbitDB,
  userId: string,
  now: number,
  subject: CoachSubject,
): Promise<string | { title: string; details: unknown }> {
  const deps = { db, userId, now } as unknown as Deps;
  switch (subject.kind) {
    case "goal": {
      const g = await TOOL_RUNNERS.get_goal({ id: subject.id }, deps);
      if (typeof g === "string") return "has since been deleted.";
      const events = live(await db.goalEvents.where("goalId").equals(subject.id).toArray())
        .sort((a, b) => b.at - a.at)
        .slice(0, 8);
      const details = {
        ...(g as Record<string, unknown>),
        recentUpdates: events.length
          ? events.map((e) => ({
              type: e.type,
              change: e.type !== "note" && e.to ? `${e.from ?? "?"} → ${e.to}` : undefined,
              text: e.text?.slice(0, 300) || undefined,
              by: e.actor === "ai" ? "coach" : undefined,
              on: dayOf(e.at, "UTC"),
            }))
          : undefined,
      };
      return { title: String((g as { title: string }).title), details };
    }
    case "task": {
      const t = await TOOL_RUNNERS.get_task({ id: subject.id }, deps);
      if (typeof t === "string") return "has since been deleted.";
      return { title: String((t as { title: string }).title), details: t };
    }
    case "job": {
      const l = await db.jobLeads.get(subject.id);
      if (!l || l.deletedAt != null) return "has since been deleted.";
      const posting = l.postingId ? await db.jobPostings.get(l.postingId) : undefined;
      const profile = await db.careerProfile.get(careerProfileId(userId));
      return {
        title: `${l.role ? `${l.role} at ` : ""}${l.company}`,
        details: {
          company: l.company,
          role: l.role || undefined,
          location: l.location ?? undefined,
          salary: l.salary ?? undefined,
          url: l.url ?? undefined,
          stage: l.stage,
          outcome: l.outcome ?? undefined,
          nextStep: l.nextStep || undefined,
          nextDate: l.nextDate ?? undefined,
          appliedOn: l.appliedAt ? dayOf(l.appliedAt, "UTC") : undefined,
          notes: l.notes.trim() ? l.notes.trim().slice(0, 3000) : undefined,
          role_found: posting
            ? {
                fit: posting.fit ?? undefined,
                why: posting.why.length ? posting.why : undefined,
                gaps: posting.gaps.length ? posting.gaps : undefined,
                description: posting.description.slice(0, 2500),
              }
            : undefined,
          applicationPack: l.pack
            ? {
                prepared: dayOf(l.pack.generatedAt, "UTC"),
                coverLetterOpening: l.pack.coverLetter.slice(0, 600),
                toCheck: l.pack.flags.length ? l.pack.flags : undefined,
              }
            : "None yet (Prepare application on the lead's page makes one).",
          theirHeadline: profile && !profile.deletedAt ? profile.headline || undefined : undefined,
        },
      };
    }
    case "pot": {
      const p = await db.savingsPots.get(subject.id);
      if (!p || p.deletedAt != null) return "has since been deleted.";
      const s = await loadSettings(db, userId);
      const currency = s.currency ?? DEFAULT_CURRENCY;
      const day = todayOf(s.timezone, now);
      const pr = potProjection(p, live(await db.transactions.toArray()), day);
      return {
        title: p.name,
        details: {
          today: day,
          currency,
          balance: major(pr.balance, currency),
          target: major(p.target, currency),
          left: major(pr.left, currency),
          targetDate: p.targetDate ?? undefined,
          monthlyRateLastThreeMonths: major(pr.monthlyRate, currency),
          reachMonthAtThisRate: pr.reachMonth ?? undefined,
          neededPerMonthForDate: pr.neededPerMonth != null ? major(pr.neededPerMonth, currency) : undefined,
          reached: pr.done,
          linkedGoalId: p.goalId ?? undefined,
        },
      };
    }
    case "debt": {
      const d = await db.debts.get(subject.id);
      if (!d || d.deletedAt != null) return "has since been deleted.";
      const s = await loadSettings(db, userId);
      const currency = s.currency ?? DEFAULT_CURRENCY;
      const day = todayOf(s.timezone, now);
      const transactions = live(await db.transactions.toArray());
      const st = debtState(d, transactions, day);
      const all = live(await db.debts.toArray());
      const states = new Map(all.map((x) => [x.id, debtState(x, transactions, day)]));
      const plan = payoffPlan(all, states, suggestedMonthly(all, states), "avalanche", monthOf(day));
      const line = plan.lines.find((l) => l.debt.id === d.id);
      return {
        title: d.name,
        details: {
          today: day,
          currency,
          direction: d.direction === "owe" ? "they owe it" : "owed to them",
          kind: DEBT_KIND_LABEL[d.kind],
          balance: major(st.balance, currency),
          principal: major(d.principal, currency),
          paid: major(st.paid, currency),
          interestSoFar: major(st.interest, currency),
          interestRate: d.interestRate ?? undefined,
          minimumPayment: d.minimumPayment != null ? major(d.minimumPayment, currency) : undefined,
          nextDue: st.nextDue ?? undefined,
          cleared: Boolean(d.closedAt) || st.balance <= 0,
          inThePlan: line
            ? { order: line.order, clearsBy: line.clearMonth ?? undefined, atMonthly: major(plan.monthly, currency) }
            : undefined,
          linkedGoalId: d.goalId ?? undefined,
        },
      };
    }
    case "course": {
      const c = await db.learningItems.get(subject.id);
      if (!c || c.deletedAt != null) return "has since been deleted.";
      const s = await loadSettings(db, userId);
      const day = todayOf(s.timezone, now);
      const skill = c.skillId ? await db.skills.get(c.skillId) : undefined;
      const sections = c.sections ?? [];
      const tasks = sections.length ? await db.tasks.where("learningItemId").equals(c.id).toArray() : [];
      const byId = new Map(tasks.filter((t) => t.deletedAt == null).map((t) => [t.id, t]));
      const p = coursePace(sections, tasks, c.plan, day);
      return {
        title: c.title,
        details: {
          today: day,
          kind: c.kind,
          author: c.author ?? undefined,
          status: c.status,
          progress: `${c.progress}%`,
          skill:
            skill && !skill.deletedAt
              ? `${skill.name} (level ${skill.level} of 5, aiming for ${skill.targetLevel})`
              : undefined,
          plan: c.plan
            ? {
                finishBy: c.plan.targetDate,
                studyDays: c.plan.days,
                minutesPerDay: c.plan.minutesPerDay,
                sectionsBehind: p.behind || undefined,
                daysLeft: p.daysLeft ?? undefined,
              }
            : "Not planned yet.",
          sections: sections.length
            ? sections.slice(0, 80).map((x) => ({
                title: x.title,
                minutes: x.minutes ?? undefined,
                done: x.doneAt != null || undefined,
                plannedFor: (x.taskId ? byId.get(x.taskId)?.scheduledDate : undefined) ?? undefined,
              }))
            : "No sections yet.",
          notes: c.notes.trim() ? c.notes.trim().slice(0, 2000) : undefined,
        },
      };
    }
  }
}

const AUTONOMY_TEXT = {
  suggest: "suggest only — your changes are shown to them as suggestions to accept.",
  act_tell: "act and tell — make changes they ask for and summarise them.",
  act_silent: "act quietly — make changes they ask for; keep the summary to one line.",
} as const;

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

/** Runs one tool call on the device. Never throws: errors go back to the model as error results. */
export async function runCoachTool(name: string, input: unknown, deps: Deps): Promise<ToolOutcome> {
  if (!isCoachTool(name)) return { content: `Unknown tool: ${name}`, isError: true };
  const parsed = COACH_TOOLS[name].input.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      isError: true,
    };
  }
  try {
    if (WRITE_TOOLS.has(name)) {
      const out = await runWriteTool(name as WriteToolName, parsed.data as Record<string, unknown>, deps);
      return { content: out.content };
    }
    const result = await TOOL_RUNNERS[name as ReadToolName](parsed.data as never, deps);
    return { content: typeof result === "string" ? result : JSON.stringify(result) };
  } catch (err) {
    return { content: `Failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

type ReadToolName = Exclude<keyof typeof COACH_TOOLS, WriteToolName>;

type Runner<N extends keyof typeof COACH_TOOLS> = (
  input: import("zod").infer<(typeof COACH_TOOLS)[N]["input"]>,
  deps: Deps,
) => Promise<unknown>;

const TOOL_RUNNERS: { [N in ReadToolName]: Runner<N> } = {
  async get_overview(_input, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const day = todayOf(s.timezone, now);
    const tasks = await allTasks(db);
    const plan = buildToday(tasks, {
      today: day,
      now,
      timezone: s.timezone,
      capacity: s.dailyCapacityPts,
      pinStale: s.strictness !== "gentle",
    });
    const habits = live(await db.habits.toArray()).filter((h) => h.archivedAt == null);
    const logs = live(await db.habitLogs.toArray());
    const habitsToday = habits.map((h) => {
      const st = habitStatus(
        h,
        logs.filter((l) => l.habitId === h.id),
        day,
        { weekStart: s.weekStartDay, startDay: dayOf(h.createdAt, s.timezone) },
      );
      return {
        id: h.id,
        name: h.name,
        due: st.due,
        doneToday: st.doneToday,
        streak: st.streak,
        unit: st.unit,
        atRisk: st.atRisk,
      };
    });
    const cycles = live(await db.cycles.toArray());
    const cycle = currentCycle(cycles, day);
    const goals = live(await db.goals.toArray()).filter((g) => g.status === "active");
    const krs = live(await db.keyResults.toArray());
    const areas = new Map(live(await db.areas.toArray()).map((a) => [a.id, a.name]));
    const level = levelFromXp(totalXp(live(await db.xpEvents.toArray())));

    return {
      today: `${longDayLabel(day)} ${day}`,
      mustDos: plan.mustDos.map(taskBrief),
      alsoToday: plan.also.slice(0, 15).map(taskBrief),
      overdue: plan.overdue.slice(0, 10).map(taskBrief),
      overdueCount: plan.overdue.length,
      stale: plan.stale.slice(0, 5).map(taskBrief),
      staleCount: plan.stale.length,
      doneToday: plan.doneToday.length,
      capacity: plan.capacity,
      habits: habitsToday,
      cycle: cycle
        ? {
            number: cycle.number,
            start: cycle.startDate,
            end: cycle.endDate,
            daysLeft: daysLeft(cycle, day),
            theme: cycle.theme ?? undefined,
            planned: cycle.committedAt != null,
            points: cyclePoints(tasks, cycle),
          }
        : null,
      activeGoals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        area: g.areaId ? areas.get(g.areaId) : undefined,
        health: g.health ?? undefined,
        targetDate: g.targetDate ?? undefined,
        progress: Math.round(
          goalProgress(
            krs.filter((k) => k.goalId === g.id),
            tasks.filter((t) => t.goalId === g.id),
          ) * 100,
        ),
      })),
      level: { level: level.level, title: level.title, xp: level.total },
      areas: [...areas].map(([areaId, name]) => ({ id: areaId, name })),
      reminders: live(await db.reminders.toArray())
        .filter((r) => r.kind === "custom" && r.status === "pending" && r.fireAt > now)
        .map((r) => ({ id: r.id, title: r.title, at: new Date(r.fireAt).toISOString() })),
      quarter: await quarterSummary(db, userId, day, tasks),
      ...(await peopleSummary(db, s.timezone, day, 2)),
    };
  },

  async search({ query, kinds, includeDone }, { db }) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (s: string) => {
      const l = s.toLowerCase();
      return words.every((w) => l.includes(w));
    };
    const want = (k: "task" | "goal" | "habit" | "transaction" | "pot" | "debt") => !kinds || kinds.includes(k);
    const out: Record<string, unknown>[] = [];
    if (want("task")) {
      for (const t of await allTasks(db)) {
        if ((includeDone || isOpen(t)) && hit(t.title)) out.push({ kind: "task", ...taskBrief(t) });
      }
    }
    if (want("goal")) {
      for (const g of live(await db.goals.toArray())) {
        if (hit(g.title)) out.push({ kind: "goal", id: g.id, title: g.title, status: g.status });
      }
    }
    if (want("habit")) {
      for (const h of live(await db.habits.toArray())) {
        if (h.archivedAt == null && hit(h.name)) out.push({ kind: "habit", id: h.id, name: h.name });
      }
    }
    // 5F: money.
    if (want("pot")) {
      for (const p of live(await db.savingsPots.toArray())) {
        if (p.archivedAt == null && hit(p.name)) out.push({ kind: "pot", id: p.id, name: p.name });
      }
    }
    if (want("debt")) {
      for (const d of live(await db.debts.toArray())) {
        if (d.archivedAt == null && hit(d.name))
          out.push({ kind: "debt", id: d.id, name: d.name, direction: d.direction });
      }
    }
    if (want("transaction")) {
      const cats = new Map(live(await db.categories.toArray()).map((c) => [c.id, c.name]));
      for (const t of live(await db.transactions.toArray())
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 500)) {
        const label = transactionLabel(t, { category: (id) => cats.get(id) });
        if (hit(label))
          out.push({ kind: "transaction", id: t.id, date: t.date, label, kindOfMoney: t.kind, amount: t.amount });
      }
    }
    return { matches: out.slice(0, 20), total: out.length };
  },

  async get_task({ id, number }, { db }) {
    const tasks = await allTasks(db);
    const t = tasks.find((x) => (id ? x.id === id : x.number === number));
    if (!t) return "No such task.";
    const goal = t.goalId ? await db.goals.get(t.goalId) : undefined;
    const events = live(await db.taskEvents.where("taskId").equals(t.id).toArray())
      .sort((a, b) => b.at - a.at)
      .slice(0, 10);
    return {
      ...taskBrief(t),
      description: t.description ? t.description.slice(0, 2000) : undefined,
      goal: goal ? { id: goal.id, title: goal.title } : undefined,
      planDay: planDay(t) ?? undefined,
      subtasks: tasks
        .filter((x) => x.parentTaskId === t.id)
        .map((x) => ({ id: x.id, title: x.title, done: x.status === "done" })),
      history: events.map((e) => ({
        type: e.type,
        from: e.from ?? undefined,
        to: e.to ?? undefined,
        reason: e.reason ?? undefined,
        at: new Date(e.at).toISOString(),
      })),
    };
  },

  async get_goal({ id }, { db }) {
    const g = await db.goals.get(id);
    if (!g || g.deletedAt != null) return "No such goal.";
    const tasks = (await allTasks(db)).filter((t) => t.goalId === id);
    const krs = live(await db.keyResults.where("goalId").equals(id).toArray());
    const milestones = live(await db.milestones.where("goalId").equals(id).toArray());
    return {
      id: g.id,
      title: g.title,
      description: g.description ? g.description.slice(0, 2000) : undefined,
      status: g.status,
      health: g.health ?? undefined,
      startDate: g.startDate ?? undefined,
      targetDate: g.targetDate ?? undefined,
      progress: Math.round(goalProgress(krs, tasks) * 100),
      keyResults: krs.map((k) => ({
        id: k.id,
        title: k.title,
        current: k.current,
        target: k.target,
        unit: k.unit ?? undefined,
      })),
      milestones: milestones
        .sort((a, b) => a.order - b.order)
        .map((m) => ({ id: m.id, title: m.title, due: m.dueDate ?? undefined, done: m.doneAt != null })),
      openTasks: tasks.filter((t) => isOpen(t) && !t.parentTaskId).map(taskBrief),
      doneTasks: tasks.filter((t) => t.status === "done" && !t.parentTaskId).length,
    };
  },

  async get_calendar_availability({ date, days }, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const today = todayOf(s.timezone, now);
    const first = date ?? today;
    const calendars = live(await db.calendars.toArray());
    const shown = new Map(calendars.filter((c) => c.selected && !c.isOrbit).map((c) => [c.id, c.name]));
    const events = live(await db.calendarEvents.toArray()).filter((e) => shown.has(e.calendarId));
    const blocks = live(await db.timeBlocks.toArray());
    const tasks = await allTasks(db);
    const t = (ms: number) => timeOf(ms, s.timezone);
    const out = Array.from({ length: days ?? 1 }, (_, i) => {
      const d = addDays(first, i);
      const dayEvents = events.filter((e) => onDay(e, d, s.timezone)).sort((a, b) => a.start - b.start);
      const dayBlocks = blocks.filter((b) => dayOf(b.start, s.timezone) === d).sort((a, b) => a.start - b.start);
      const mustDos = tasks.filter((x) => x.mustDoDate === d && isOpen(x));
      const fit = dayFit({
        day: d,
        timezone: s.timezone,
        workingHours: s.workingHours,
        events: dayEvents,
        blocks: dayBlocks,
        mustDos,
        now,
      });
      return {
        date: d,
        events: dayEvents.map((e) => ({
          title: e.title,
          time: e.allDay ? "all day" : `${t(e.start)}–${t(e.end)}`,
          calendar: shown.get(e.calendarId),
          ...(e.status === "tentative" ? { tentative: true } : {}),
        })),
        timeBlocks: dayBlocks.map((b) => ({
          id: b.id,
          title: b.title,
          taskId: b.taskId ?? undefined,
          time: `${t(b.start)}–${t(b.end)}`,
        })),
        free: fit.slots.map((x) => `${t(x.start)}–${t(x.end)}`),
        freeMinutes: spanMinutes(fit.slots),
        ...(mustDos.length ? { mustDos: { needMinutes: fit.need, fit: fit.fits } } : {}),
      };
    });
    return {
      timezone: s.timezone,
      workingHours: s.workingHours,
      calendarsConnected: shown.size > 0,
      ...(first === today ? { now: t(now) } : {}),
      days: out,
    };
  },

  async get_cycle_plan(_input, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const day = todayOf(s.timezone, now);
    const tasks = await allTasks(db);
    const cycles = live(await db.cycles.toArray());
    const target = planningTarget(cycles, day);
    if (!target) return "There's no cycle to plan yet. Cycles are created once onboarding is done.";
    const learned = suggestedCapacity(cycles, tasks, target.number);
    const inCycle = tasks.filter((t) => t.cycleId === target.id && !t.parentTaskId && t.status !== "cancelled");
    const goals = live(await db.goals.toArray()).filter((g) => g.status === "active");
    const rank = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;
    const candidates = planningCandidates(tasks, target.id)
      .sort((a, b) => rank[a.priority] - rank[b.priority] || a.order - b.order)
      .slice(0, 60);
    return {
      cycle: {
        number: target.number,
        start: target.startDate,
        end: target.endDate,
        theme: target.theme ?? undefined,
        committed: target.committedAt != null,
        focusGoalIds: target.focusGoalIds,
      },
      capacity: {
        setting: s.cycleCapacityPts,
        finishedOnAverage: learned ? { points: learned.points, overCycles: learned.cycles } : "not enough history yet",
      },
      inCycle: inCycle.map(taskBrief),
      inCyclePoints: inCycle.reduce((n, t) => n + (t.effort ?? 0), 0),
      activeGoals: goals.map((g) => ({ id: g.id, title: g.title, targetDate: g.targetDate ?? undefined })),
      // QTR-3: the quarter's goals come first; each should have work in the cycle.
      quarterGoals: await (async () => {
        const doc = await db.quarters.get(quarterId(userId, quarterOf(target.startDate)));
        return (doc && !doc.deletedAt ? doc.goalIds : [])
          .filter((id) => goals.some((g) => g.id === id))
          .map((id) => ({ id, tasksInCycle: inCycle.filter((t) => t.goalId === id).length }));
      })(),
      candidates: candidates.map((t) => ({ ...taskBrief(t), goalId: t.goalId ?? undefined })),
      candidatesShown: candidates.length,
    };
  },

  async remember({ text }, { actions }) {
    const id = await actions.remember(text, "coach");
    return `Saved (id ${id}).`;
  },

  async forget({ id }, { db, actions }) {
    const m = await db.aiMemories.get(id);
    if (!m || m.deletedAt != null || m.archivedAt != null) return "No such note.";
    await actions.forgetMemory(id);
    return "Forgotten.";
  },

  async get_reflection({ days }, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const day = todayOf(s.timezone, now);
    const from = addDays(day, -((days ?? 14) - 1));
    const entries = live(await db.journalEntries.toArray())
      .filter((e) => e.date >= from && e.date <= day && (e.text.trim() || e.mood || e.energy))
      .sort((a, b) => b.date.localeCompare(a.date));
    const wins = live(await db.wins.toArray())
      .filter((w) => w.date >= from && w.date <= day)
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      from,
      to: day,
      journal: entries.map((e) => ({
        date: e.date,
        mood: e.mood ? `${e.mood}/5` : undefined,
        energy: e.energy ? `${e.energy}/5` : undefined,
        text: e.text.trim() ? e.text.trim().slice(0, 1500) : undefined,
      })),
      wins: wins.map((w) => ({ date: w.date, title: w.title, impact: w.impact || undefined })),
    };
  },

  async get_job_assistant(_input, { db, userId }) {
    const profile = await db.careerProfile.get(careerProfileId(userId));
    const live = profile && !profile.deletedAt ? profile : null;
    const readiness = profileReadiness(live);
    const postings = (await db.jobPostings.toArray())
      .filter((p) => p.deletedAt == null && (p.status === "new" || p.status === "saved"))
      .sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1))
      .slice(0, 20);
    const leads = (await db.jobLeads.toArray()).filter((l) => l.deletedAt == null && l.stage !== "closed");
    return {
      profile: live
        ? {
            ready: readiness.ready,
            missing: readiness.missing.length ? readiness.missing : undefined,
            headline: live.headline,
            roles: live.experience.length,
            lookingFor: live.preferences.roles,
            markets: live.preferences.markets,
            companiesWatched: live.companies.map((c) => c.name),
            search: (() => {
              const st = searchSettings(live);
              return {
                paused: st.paused ? (st.pausedUntil ? `until ${st.pausedUntil}` : "until resumed") : false,
                dailyFrom: `${String(st.hour).padStart(2, "0")}:00`,
                rankUpTo: st.maxRanked,
                minimumFit: st.minFit,
                sourcesOff: st.off.length ? st.off : undefined,
              };
            })(),
          }
        : "No career profile yet; they can set it up at Job search → profile (or start from their CV).",
      foundRoles: postings.map((p) => ({
        id: p.id,
        title: p.title,
        company: p.company,
        location: `${p.location}${p.remote ? " (remote)" : ""}`,
        fit: p.fit ?? undefined,
        why: p.why.length ? p.why : undefined,
        gaps: p.gaps.length ? p.gaps : undefined,
        saved: p.status === "saved" || undefined,
      })),
      leadsWithPack: leads
        .filter((l) => l.pack)
        .map((l) => ({ id: l.id, company: l.company, role: l.role, stage: l.stage })),
      leadsWithoutPack: leads
        .filter((l) => !l.pack && l.stage === "researching")
        .map((l) => ({ id: l.id, company: l.company, role: l.role })),
    };
  },

  // ---- 5F: money. Amounts go to the model in the main unit (D47 keeps minor units in the ledger).
  async get_money({ month }, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const currency = s.currency ?? DEFAULT_CURRENCY;
    const day = todayOf(s.timezone, now);
    const m = month ?? monthOf(day);
    const [transactions, categories, budgets, pots, debts, accounts, holdings] = await Promise.all([
      db.transactions.toArray().then(live),
      db.categories.toArray().then(live),
      db.budgets.toArray().then(live),
      db.savingsPots.toArray().then((r) => live(r).filter((p) => p.archivedAt == null)),
      db.debts.toArray().then((r) => live(r).filter((d) => d.archivedAt == null)),
      db.accounts.toArray().then(live),
      db.holdings.toArray().then(live),
    ]);
    const cat = (id: string | null) =>
      id ? (categories.find((c) => c.id === id)?.name ?? "Uncategorised") : "Uncategorised";
    const sum = monthSummary(transactions, m);
    const inMonth = transactions.filter((t) => monthOf(t.date) === m);
    return {
      currency,
      month: m,
      today: day,
      income: major(sum.income, currency),
      spent: major(sum.expense, currency),
      left: major(sum.net, currency),
      spentByCategory: spendByCategory(transactions, m).map((r) => ({
        category: cat(r.categoryId),
        amount: major(r.amount, currency),
      })),
      budgets: budgetStatuses(budgets, transactions, m, day).map((b) => ({
        category: b.categoryId ? cat(b.categoryId) : "overall",
        limit: major(b.budget.amount, currency),
        spent: major(b.spent, currency),
        pace: PACE_LABEL[b.pace],
      })),
      pots: pots.map((p) => {
        const pr = potProjection(p, transactions, day);
        return {
          id: p.id,
          name: p.name,
          balance: major(pr.balance, currency),
          target: major(p.target, currency),
          targetDate: p.targetDate ?? undefined,
          monthlyRate: major(pr.monthlyRate, currency),
          reachMonth: pr.reachMonth ?? undefined,
          neededPerMonth: pr.neededPerMonth != null ? major(pr.neededPerMonth, currency) : undefined,
          linkedGoalId: p.goalId ?? undefined,
        };
      }),
      debts: debts.map((d) => {
        const st = debtState(d, transactions, day);
        return {
          id: d.id,
          name: d.name,
          direction: d.direction,
          kind: DEBT_KIND_LABEL[d.kind],
          balance: major(st.balance, currency),
          principal: major(d.principal, currency),
          paid: major(st.paid, currency),
          interestRate: d.interestRate ?? undefined,
          minimumPayment: d.minimumPayment != null ? major(d.minimumPayment, currency) : undefined,
          nextDue: st.nextDue ?? undefined,
          cleared: Boolean(d.closedAt) || st.balance <= 0,
        };
      }),
      netWorth: major(netWorth({ accounts, pots, debts, holdings, transactions }, currency, day).total, currency),
      plan: (() => {
        const pl = monthPlan({ settings: s, transactions, budgets, pots, debts, categories }, day, m);
        return {
          expectedIncome: major(pl.income, currency),
          incomes: pl.incomes.map((i) => ({ name: i.name, amount: major(i.amount, currency), note: i.note })),
          incomeByMonth: incomeByMonth(s.money?.incomes ?? [], m).map((x) => ({
            month: x.month,
            income: major(x.income, currency),
            from: x.sources,
          })),
          fixedCosts: major(pl.fixedTotal, currency),
          budgets: major(pl.budgetsTotal, currency),
          savings: pl.savings.map((x) => ({ pot: x.name, monthly: major(x.amount, currency), basis: x.note })),
          debtMinimums: major(pl.debtsTotal, currency),
          left: major(pl.left, currency),
          note: pl.income
            ? undefined
            : "No expected income set; set_income records it, then plan_month can fit budgets and pots to it.",
        };
      })(),
      categories: categories.filter((c) => c.archivedAt == null).map((c) => `${c.name} (${c.kind})`),
      recent: inMonth.slice(0, 10).map((t) => ({
        id: t.id,
        date: t.date,
        kind: t.kind,
        amount: major(t.amount, currency),
        label: transactionLabel(t, { category: (id) => cat(id) }),
      })),
      note: "Amounts in the main unit of the currency. Transfers between accounts, into pots and onto debts aren't spending.",
    };
  },
  async get_payoff_plan({ monthly, strategy }, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const currency = s.currency ?? DEFAULT_CURRENCY;
    const day = todayOf(s.timezone, now);
    const [transactions, debts] = await Promise.all([
      db.transactions.toArray().then(live),
      db.debts.toArray().then(live),
    ]);
    const states = new Map(debts.map((d) => [d.id, debtState(d, transactions, day)]));
    const amount = monthly != null ? Math.round(monthly * minorPerMajor(currency)) : suggestedMonthly(debts, states);
    const plan = payoffPlan(debts, states, amount, strategy ?? "avalanche", monthOf(day));
    const more = payoffPlan(
      debts,
      states,
      amount + Math.max(1000, Math.round(amount * 0.1)),
      strategy ?? "avalanche",
      monthOf(day),
    );
    return {
      currency,
      strategy: plan.strategy,
      monthly: major(amount, currency),
      clearsBy: plan.doneMonth ?? "never at this amount (interest outruns the payments)",
      months: Number.isFinite(plan.months) ? plan.months : undefined,
      totalInterest: major(plan.totalInterest, currency),
      order: plan.lines.map((l) => ({
        debt: l.debt.name,
        balance: major(l.startBalance, currency),
        rate: l.debt.interestRate ?? 0,
        clearsBy: l.clearMonth ?? undefined,
        interest: major(l.interest, currency),
      })),
      payingMore: more.doneMonth
        ? {
            monthly: major(more.monthly, currency),
            clearsBy: more.doneMonth,
            interestSaved: major(plan.totalInterest - more.totalInterest, currency),
          }
        : undefined,
    };
  },
  async get_investments(_input, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const currency = s.currency ?? DEFAULT_CURRENCY;
    const day = todayOf(s.timezone, now);
    const [transactions, accounts, pots, debts, holdings] = await Promise.all([
      db.transactions.toArray().then(live),
      db.accounts.toArray().then(live),
      db.savingsPots.toArray().then(live),
      db.debts.toArray().then(live),
      db.holdings.toArray().then((r) => live(r).filter((h) => h.archivedAt == null)),
    ]);
    const nw = netWorth({ accounts, pots, debts, holdings, transactions }, currency, day);
    return {
      currency,
      holdings: holdings.map((h) => {
        const sm = holdingSummary(h, currency);
        return {
          id: h.id,
          name: h.name,
          type: HOLDING_TYPE_LABEL[h.type],
          symbol: h.symbol ?? undefined,
          units: h.quantity,
          cost: major(sm.cost, currency),
          value: major(sm.value, currency),
          gain: major(sm.gain, currency),
          gainPct: sm.gainPct != null ? Math.round(sm.gainPct * 1000) / 10 : undefined,
          priced: sm.priced
            ? `as of ${h.priceAt ? new Date(h.priceAt).toISOString().slice(0, 10) : "?"}`
            : "valued by hand",
        };
      }),
      spread: allocation(holdings, currency).map((a) => ({
        type: HOLDING_TYPE_LABEL[a.type],
        value: major(a.value, currency),
        share: Math.round(a.share * 100),
      })),
      netWorth: {
        total: major(nw.total, currency),
        accounts: major(nw.accounts, currency),
        pots: major(nw.pots, currency),
        holdings: major(nw.holdings, currency),
        owedToThem: major(nw.owed, currency),
        debts: major(nw.debts, currency),
      },
      note: "Explain and compare with general rules of thumb; never say what to buy or sell (D52).",
    };
  },
  async get_career(_input, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const day = todayOf(s.timezone, now);
    const [skills, learning, leads, goals] = await Promise.all([
      db.skills.toArray().then(live),
      db.learningItems.toArray().then(live),
      db.jobLeads.toArray().then(live),
      db.goals.toArray().then(live),
    ]);
    const skillName = new Map(skills.map((k) => [k.id, k.name]));
    const stats = pipelineStats(leads);
    return {
      today: day,
      skills: skills
        .filter((k) => k.archivedAt == null)
        .map((k) => ({
          id: k.id,
          name: k.name,
          category: k.category || undefined,
          level: `${k.level} ${SKILL_LEVELS[k.level].label}`,
          target: `${k.targetLevel} ${SKILL_LEVELS[k.targetLevel].label}`,
          targetDate: k.targetDate ?? undefined,
          goal: k.goalId ? goals.find((g) => g.id === k.goalId)?.title : undefined,
          evidence: k.evidence.trim() ? k.evidence.trim().slice(0, 600) : undefined,
        })),
      learning: learning
        .filter((l) => l.status !== "dropped")
        .sort((a, b) => a.order - b.order)
        .slice(0, 60)
        .map((l) => ({
          id: l.id,
          title: l.title,
          kind: l.kind,
          author: l.author ?? undefined,
          status: l.status,
          progress: l.status === "in_progress" ? `${l.progress}%` : undefined,
          skill: l.skillId ? skillName.get(l.skillId) : undefined,
          sections: l.sections?.length
            ? `${l.sections.filter((x) => x.doneAt != null).length} of ${l.sections.length} done`
            : undefined,
          nextSection: l.sections?.find((x) => x.doneAt == null)?.title,
          plan: l.plan
            ? { finishBy: l.plan.targetDate, studyDays: l.plan.days, minutesPerDay: l.plan.minutesPerDay }
            : undefined,
        })),
      jobSearch: {
        applied: stats.applied,
        interviewRate: `${Math.round(stats.interviewRate * 100)}%`,
        offerRate: `${Math.round(stats.offerRate * 100)}%`,
        openByStage: stats.open,
        leads: leads
          .sort((a, b) => a.order - b.order)
          .slice(0, 80)
          .map((l) => ({
            id: l.id,
            company: l.company,
            role: l.role || undefined,
            stage: l.stage,
            outcome: l.outcome ?? undefined,
            nextStep: l.stage !== "closed" && l.nextStep ? l.nextStep : undefined,
            nextDate: l.stage !== "closed" ? (l.nextDate ?? undefined) : undefined,
            overdue: l.stage !== "closed" && l.nextDate != null && l.nextDate < day ? true : undefined,
          })),
      },
    };
  },

  async get_insights({ cycles: n }, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const day = todayOf(s.timezone, now);
    const tz = s.timezone;
    const [tasks, events, sessions, rituals, cycles, xp, journal, areas, goals, krs, ratings] = await Promise.all([
      allTasks(db),
      db.taskEvents.toArray().then(live),
      db.focusSessions.toArray().then(live),
      db.rituals.toArray().then(live),
      db.cycles.toArray().then(live),
      db.xpEvents.toArray().then(live),
      db.journalEntries.toArray().then(live),
      db.areas.toArray().then(live),
      db.goals.toArray().then(live),
      db.keyResults.toArray().then(live),
      db.areaRatings.toArray().then(live),
    ]);
    const r = insightRange(cycles, day, n ?? 4);
    const areaName = (id: string | null) =>
      id ? (areas.find((a) => a.id === id)?.name ?? "Archived area") : "No area";
    const trend = cycleTrend(r, tasks, sessions, xp, tz, day);
    const skips = skipInsights(events, tasks, r, tz);
    const rit = ritualConsistency(rituals, r, day);
    const pct = (c: { done: number; of: number }) =>
      c.of ? `${Math.round((c.done / c.of) * 100)}% (${c.done} of ${c.of})` : "n/a";
    const touched = lastTouched(tasks, sessions);
    const g = withSuggestedHealth(goals, krs, tasks, day, tz);
    const latest = [...ratings].sort((a, b) => b.date.localeCompare(a.date))[0];
    const mood = moodVsDone(journal, tasks, sessions, r, tz);
    const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return {
      from: r.from,
      to: r.to,
      headlines: headlines({ trend, skips, reasonLabel: (id) => skipReasonLabel(id) ?? id, areaName }),
      cycles: trend.map((c) => ({
        cycle: c.number,
        planFinished: `${Math.round(c.completion * 100)}%${c.current ? " so far (current)" : ""}`,
        focusHours: c.focusHours,
        xp: c.xp,
      })),
      focusHoursPerWeek: focusByWeek(sessions, r, tz, s.weekStartDay).map((w) => ({ week: w.week, hours: w.hours })),
      doneByArea: doneByArea(tasks, r, tz).map((a) => ({ area: areaName(a.areaId), tasks: a.count, points: a.points })),
      rituals: { dailyPlan: pct(rit.plan), shutdown: pct(rit.shutdown), cycleReview: pct(rit.review) },
      skips: {
        total: skips.total,
        reasons: skips.reasons.map((x) => ({
          reason: x.reason === "none" ? "no reason given" : skipReasonLabel(x.reason),
          count: x.count,
        })),
        areas: skips.areas.slice(0, 5).map((x) => ({ area: areaName(x.areaId), count: x.count })),
        goals: skips.goals
          .slice(0, 5)
          .map((x) => ({ goal: goals.find((y) => y.id === x.goalId)?.title, count: x.count })),
        byWeekday: Object.fromEntries(skips.weekdays.map((c, i) => [WEEKDAY[i], c])),
      },
      postponedBeforeDone: postponementsBeforeDone(tasks, r, tz),
      staleTasksAtWeekEnd: staleTrend(tasks, events, r, tz, s.weekStartDay).map((w) => ({
        week: w.week,
        stale: w.count,
      })),
      areaHealth: areas
        .filter((a) => a.archivedAt == null)
        .map((a) => {
          const h = areaHealth(a.id, { goals: g, tasks, today: day, now, tz, touched });
          return { area: a.name, health: h.level, reasons: h.reasons.length ? h.reasons : undefined };
        }),
      wheelOfLife: latest
        ? {
            ratedOn: latest.date,
            areas: latest.scores.map((x) => ({
              area: areaName(x.areaId),
              going: `${x.score}/10`,
              matters: `${x.importance}/10`,
            })),
            focusVsImportance: timeVsValues(sessions, tasks, latest, r, tz).map((v) => ({
              area: areaName(v.areaId),
              focusShare: `${Math.round(v.focusShare * 100)}%`,
              importanceShare: `${Math.round(v.importanceShare * 100)}%`,
            })),
          }
        : "Not rated yet",
      moodAndEnergy: mood.enough
        ? {
            byMood: mood.mood
              .filter((x) => x.days)
              .map((x) => ({
                mood: `${x.level}/5`,
                days: x.days,
                avgTasksDone: x.done,
                avgFocusMinutes: x.focusMinutes,
              })),
            byEnergy: mood.energy
              .filter((x) => x.days)
              .map((x) => ({
                energy: `${x.level}/5`,
                days: x.days,
                avgTasksDone: x.done,
                avgFocusMinutes: x.focusMinutes,
              })),
          }
        : `Only ${mood.rated} days with mood or energy in this range; at least 7 are needed.`,
    };
  },

  async get_people({ query }, { db, userId, now }) {
    const s = await loadSettings(db, userId);
    const day = todayOf(s.timezone, now);
    const people = live(await db.people.toArray()).filter((p) => p.archivedAt == null);
    const interactions = live(await db.interactions.toArray());
    const q = query?.toLowerCase();
    const shown = people
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 100);
    return {
      people: shown.map((p) => {
        const last = lastInTouch(interactions.filter((i) => i.personId === p.id));
        return {
          id: p.id,
          name: p.name,
          relationship: RELATIONSHIP_META[p.relationship].label,
          keepInTouch: p.cadenceDays ? cadenceLabel(p.cadenceDays) : undefined,
          lastInTouch: last ? `${last} (${agoLabel(last, day).toLowerCase()})` : "never logged",
          snoozedUntil: p.snoozedUntil && p.snoozedUntil > day ? p.snoozedUntil : undefined,
        };
      }),
      total: people.length,
      ...(await peopleSummary(db, s.timezone, day, 10)),
    };
  },

  async get_person({ id }, { db, userId, now }) {
    const p = await db.people.get(id);
    if (!p || p.deletedAt != null) return "No such person.";
    const s = await loadSettings(db, userId);
    const day = todayOf(s.timezone, now);
    const interactions = live(await db.interactions.where("personId").equals(id).toArray()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    const items = live(await db.personItems.where("personId").equals(id).toArray());
    const tasks = (await allTasks(db)).filter((t) => t.personId === id && isOpen(t));
    const goals = live(await db.goals.toArray()).filter((g) => g.personIds?.includes(id));
    const last = interactions[0]?.date ?? null;
    return {
      id: p.id,
      name: p.name,
      relationship: RELATIONSHIP_META[p.relationship].label,
      archived: p.archivedAt != null || undefined,
      keepInTouch: p.cadenceDays ? cadenceLabel(p.cadenceDays) : "no reminder",
      lastInTouch: last ? `${last} (${agoLabel(last, day).toLowerCase()})` : "never logged",
      snoozedUntil: p.snoozedUntil ?? undefined,
      dates: p.dates.map((d) => {
        const u = upcomingDate(d, day);
        return {
          what: dateTitle(p.name, d),
          date: formatPersonDate(d),
          next: u.on,
          turning: u.turning ?? undefined,
        };
      }),
      notes: p.notes || undefined,
      howWeMet: p.howWeMet || undefined,
      interests: p.interests.length ? p.interests : undefined,
      contact: { phone: p.phone ?? undefined, whatsapp: p.whatsapp ?? undefined, email: p.email ?? undefined },
      thingsToRemember: items.filter((i) => i.kind === "remember").map((i) => i.text),
      giftIdeas: items.filter((i) => i.kind === "gift").map((i) => (i.doneAt ? `${i.text} (given)` : i.text)),
      recentInteractions: interactions
        .slice(0, 10)
        .map((i) => ({ date: i.date, type: i.type, notes: i.notes || undefined })),
      interactionCount: interactions.length,
      openTasks: tasks.map(taskBrief),
      goals: goals.map((g) => ({ id: g.id, title: g.title, status: g.status })),
    };
  },
};

/** The current quarter: its goals with progress and pace (QTR-1, QTR-6). */
async function quarterSummary(db: OrbitDB, userId: string, day: string, tasks: Task[]) {
  const ref = quarterOf(day);
  const dates = quarterDates(ref);
  const doc = await db.quarters.get(quarterId(userId, ref));
  const elapsed = elapsedShare(dates, day);
  const krs = live(await db.keyResults.toArray());
  const goals = live(await db.goals.toArray());
  const items = (doc && !doc.deletedAt ? doc.goalIds : [])
    .map((id) => goals.find((g) => g.id === id))
    .filter((g) => g != null)
    .map((g) => {
      const progress = goalProgress(
        krs.filter((k) => k.goalId === g.id),
        tasks.filter((t) => t.goalId === g.id),
      );
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        progress: Math.round(progress * 100),
        pace: g.status === "completed" ? undefined : pace(progress, elapsed) === "behind" ? "behind" : "on pace",
      };
    });
  return {
    name: quarterLabel(ref),
    daysLeft: quarterDaysLeft(dates, day),
    timeGone: Math.round(elapsed * 100),
    theme: doc?.theme ?? undefined,
    goals: items,
    planned: items.length > 0,
  };
}

/** Who's due a catch-up and dates coming up, for the overview and get_people. */
async function peopleSummary(db: OrbitDB, timezone: string, day: string, limit: number) {
  const people = live(await db.people.toArray());
  if (!people.length) return {};
  const due = reachOut(people, live(await db.interactions.toArray()), day, timezone);
  return {
    dueACatchUp: due.slice(0, limit).map((r) => ({
      id: r.person.id,
      name: r.person.name,
      daysSinceContact: r.days,
      keepInTouch: cadenceLabel(r.person.cadenceDays),
    })),
    dueACatchUpCount: due.length,
    datesSoon: upcomingDates(people, day, 30)
      .slice(0, limit)
      .map((u) => ({
        personId: u.person.id,
        what: dateTitle(u.person.name, u.date),
        on: u.on,
        inDays: u.inDays,
        turning: u.turning ?? undefined,
      })),
  };
}

/**
 * The conversation as sent to the API. A context (system) message is only valid right after a
 * user message and before the assistant's reply, so one left behind by a failed turn is dropped.
 */
export function requestMessages(stored: CoachMessage[]): CoachMessage[] {
  return stored.filter((m, i) => {
    if (m.role !== "system") return true;
    const next = stored[i + 1];
    return i > 0 && stored[i - 1].role === "user" && (next === undefined || next.role === "assistant");
  });
}

/** 5F: one line about money in the per-turn context, only for someone who uses Money. */
async function moneyLine(db: OrbitDB, s: Settings, now: number): Promise<string[]> {
  const transactions = live(await db.transactions.toArray());
  if (!transactions.length) return [];
  const currency = s.currency ?? DEFAULT_CURRENCY;
  const day = todayOf(s.timezone, now);
  const m = monthOf(day);
  const sum = monthSummary(transactions, m);
  const budgets = budgetStatuses(live(await db.budgets.toArray()), transactions, m, day);
  const cats = new Map(live(await db.categories.toArray()).map((c) => [c.id, c.name]));
  const off = budgets
    .filter((b) => b.pace === "over" || b.pace === "blown")
    .map((b) => `${b.categoryId ? (cats.get(b.categoryId) ?? "?") : "overall"} ${PACE_LABEL[b.pace].toLowerCase()}`);
  return [
    `Money (${currency}, ${m}): in ${major(sum.income, currency)}, out ${major(sum.expense, currency)}, left ${major(sum.net, currency)}${off.length ? `; budgets: ${off.join(", ")}` : ""}. Details via get_money.`,
  ];
}
