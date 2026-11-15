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
import { careerProfileId, profileReadiness } from "@/features/jobs/model";
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
import type { CoachMessage } from "./protocol";
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
export async function coachContext(db: OrbitDB, userId: string, now: number): Promise<string> {
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
    ...(theme ? [`Their theme for ${day.slice(0, 4)}: "${theme}".`] : []),
    ...(values.length
      ? [`Their values: ${values.map((v) => (v.description ? `${v.name} (${v.description})` : v.name)).join("; ")}.`]
      : []),
    memories.length
      ? `What you remember about them:\n${memories.map((m) => `- [${m.id}] ${m.text}`).join("\n")}`
      : "You have no saved notes about them yet.",
  ];
  return lines.join("\n");
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
    const want = (k: "task" | "goal" | "habit") => !kinds || kinds.includes(k);
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
