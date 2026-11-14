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
import { buildToday, planDay } from "@/features/today/model";
import { levelFromXp, totalXp } from "@/features/xp/model";
import { addDays, dayOf, longDayLabel, timeOf, today as todayOf } from "@/lib/dates";
import { dayFit, onDay, spanMinutes } from "@/features/calendar/model";
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
  const lines = [
    `Now: ${longDayLabel(day)} ${day}, ${timeOfDay(now, s.timezone)} (${s.timezone}).`,
    `Settings: cycles of ${s.cycleLengthDays} days, daily capacity ${s.dailyCapacityPts} pts, strictness ${s.strictness}.`,
    `Coach autonomy: ${AUTONOMY_TEXT[s.aiAutonomy ?? "act_tell"]}`,
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
