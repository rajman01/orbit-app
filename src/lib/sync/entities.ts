import { z } from "zod";

/**
 * Registry of synced entities. Each entry describes the fields a client may write.
 * Server-managed fields (id, userId, createdAt, updatedAt, deletedAt, serverVersion,
 * and a task's `number`) are never client-writable.
 *
 * Schemas deliberately have no `.default()`s: a partial update must never reset a
 * field. Clients always send every field on create (see src/features/*\/model.ts).
 */

const id = z.string().regex(/^[0-9A-Za-z]{10,40}$/);
const ref = id.nullable();
/** A calendar day in the user's timezone, `YYYY-MM-DD`. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const ms = z.number().int();

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
export const TASK_STATUSES = ["inbox", "backlog", "todo", "in_progress", "done", "cancelled"] as const;
export const EFFORTS = [1, 2, 3, 5, 8] as const;
export const GOAL_STATUSES = ["planned", "active", "paused", "completed", "dropped"] as const;
export const GOAL_HEALTH = ["on_track", "at_risk", "off_track"] as const;
export const AREA_COLORS = [
  "blue",
  "pink",
  "green",
  "orange",
  "indigo",
  "purple",
  "mint",
  "brown",
  "cyan",
  "yellow",
] as const;

export const RELATIONSHIPS = ["family", "friend", "partner", "mentor", "colleague", "other"] as const;
export const INTERACTION_TYPES = ["call", "text", "in_person", "other"] as const;

/** An important date on a person: month/day, with the year when it's known (REL-1, REL-6). */
export const personDateSchema = z.object({
  kind: z.enum(["birthday", "anniversary", "custom"]),
  label: z.string().trim().max(60),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  year: z.number().int().min(1800).max(2200).nullable(),
});
export type PersonDate = z.infer<typeof personDateSchema>;

export const recurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365),
  /** 0 = Sunday … 6 = Saturday; weekly only. */
  byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  /** fixed: next date follows the schedule; after_completion: counts from the day it was done. */
  mode: z.enum(["fixed", "after_completion"]),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const entitySchemas = {
  settings: z.object({
    timezone: z.string().min(1).max(64),
    weekStartDay: z.number().int().min(0).max(6),
    cycleLengthDays: z.number().int().min(7).max(28),
    dailyCapacityPts: z.number().int().min(1).max(100),
    cycleCapacityPts: z.number().int().min(1).max(500),
    workingHours: z.object({ start: time, end: time }),
    /** Focus mode: Pomodoro work and break lengths (Phase 1B, optional for older documents). */
    focusMinutes: z.number().int().min(5).max(180).optional(),
    breakMinutes: z.number().int().min(1).max(60).optional(),
    /** Phase 1C: when each ritual becomes due (local time). The review is on the cycle's last day. */
    ritualTimes: z.object({ plan: time, shutdown: time, review: time }).optional(),
    /** Phase 1D: no reminders between these times (local), except a focus session ending. */
    quietHours: z.object({ start: time, end: time }).optional(),
    /** Phase 1D: which reminders to send. */
    notify: z
      .object({
        plan: z.boolean(),
        shutdown: z.boolean(),
        review: z.boolean(),
        habits: z.boolean(),
        focus: z.boolean(),
      })
      .optional(),
    /** Phase 2A: how much the coach may do on its own (PRD §10.5). */
    aiAutonomy: z.enum(["suggest", "act_tell", "act_silent"]).optional(),
    /** Phase 2A: proactive check-ins from the coach (§8.4). */
    aiCheckins: z.boolean().optional(),
    /** Phase 2B.2: the calendar account time blocks go to (null: the first one connected). */
    blocksAccountId: z.string().max(60).nullable().optional(),
    strictness: z.enum(["gentle", "firm", "strict"]),
    onboardingCompletedAt: ms.nullable(),
  }),
  areas: z.object({
    name: z.string().trim().min(1).max(60),
    icon: z.string().max(40),
    color: z.enum(AREA_COLORS),
    description: z.string().max(2000),
    order: z.number(),
    archivedAt: ms.nullable(),
  }),
  goals: z.object({
    areaId: ref,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20000),
    status: z.enum(GOAL_STATUSES),
    health: z.enum(GOAL_HEALTH).nullable(),
    priority: z.enum(PRIORITIES),
    startDate: day.nullable(),
    targetDate: day.nullable(),
    droppedReason: z.string().max(2000).nullable(),
    completedAt: ms.nullable(),
    order: z.number(),
  }),
  keyResults: z.object({
    goalId: id,
    title: z.string().trim().min(1).max(200),
    type: z.enum(["number", "percent", "boolean"]),
    start: z.number(),
    target: z.number(),
    current: z.number(),
    unit: z.string().max(20).nullable(),
    order: z.number(),
  }),
  krCheckins: z.object({
    keyResultId: id,
    goalId: id,
    value: z.number(),
    note: z.string().max(2000).nullable(),
    at: ms,
  }),
  milestones: z.object({
    goalId: id,
    title: z.string().trim().min(1).max(200),
    dueDate: day.nullable(),
    doneAt: ms.nullable(),
    order: z.number(),
  }),
  tasks: z.object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(20000),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(PRIORITIES),
    effort: z.union(EFFORTS.map((e) => z.literal(e))).nullable(),
    areaId: ref,
    goalId: ref,
    milestoneId: ref,
    parentTaskId: ref,
    dueDate: day.nullable(),
    scheduledDate: day.nullable(),
    nextStep: z.string().max(300).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    recurrence: recurrenceSchema.nullable(),
    recurrenceParentId: ref,
    completedAt: ms.nullable(),
    cancelledAt: ms.nullable(),
    createdBy: z.enum(["user", "ai", "capture"]),
    order: z.number(),
    // Phase 1B. Optional so documents and clients from earlier versions stay valid.
    /** The day this task is one of the (max 3) Must-dos. Must-dos are per day. */
    mustDoDate: day.nullable().optional(),
    /** How many times it was moved through the skip flow; reset when a stale task is resolved. */
    postponeCount: z.number().int().min(0).max(100000).optional(),
    /** Phase 1C: the cycle this task is planned into. */
    cycleId: ref.optional(),
    /** Phase 2C: the person this task is about (follow-ups). */
    personId: ref.optional(),
  }),
  taskEvents: z.object({
    taskId: id,
    type: z.enum(["created", "status", "reschedule", "skip", "edit"]),
    from: z.string().max(200).nullable(),
    to: z.string().max(200).nullable(),
    reason: z.string().max(60).nullable(),
    reasonText: z.string().max(2000).nullable(),
    actor: z.enum(["user", "ai", "system"]),
    at: ms,
  }),
  /** Phase 1C. Generated on the device with deterministic ids (see features/cycles/model.ts). */
  cycles: z.object({
    number: z.number().int().min(1).max(100000),
    startDate: day,
    endDate: day,
    theme: z.string().trim().max(200).nullable(),
    focusGoalIds: z.array(id).max(3),
    committedTaskIds: z.array(id).max(500),
    committedPts: z.number().min(0).max(100000),
    committedAt: ms.nullable(),
    /** Set when the previous cycle's review was skipped and planning went ahead anyway. */
    planningOverride: z.string().trim().max(500).nullable(),
    reviewCompletedAt: ms.nullable(),
    reflection: z.string().max(5000).nullable(),
  }),
  rituals: z.object({
    type: z.enum(["daily_plan", "daily_shutdown", "cycle_review"]),
    /** The day it belongs to, in the user's timezone. */
    date: day,
    cycleId: ref,
    startedAt: ms,
    completedAt: ms.nullable(),
    /** Answers and progress (current step, mood, energy, wins…). Kept small. */
    data: z.record(z.string(), z.any()).refine((v) => JSON.stringify(v).length <= 20_000, "too large"),
  }),
  /** Phase 1D (PRD §7.10). Streaks are computed from the logs, never stored. */
  habits: z.object({
    name: z.string().trim().min(1).max(120),
    areaId: ref,
    goalId: ref,
    schedule: z.discriminatedUnion("type", [
      z.object({ type: z.literal("daily") }),
      z.object({ type: z.literal("days"), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
      z.object({ type: z.literal("weekly"), timesPerWeek: z.number().int().min(1).max(7) }),
    ]),
    targetType: z.enum(["boolean", "count"]),
    targetCount: z.number().int().min(1).max(100000),
    unit: z.string().trim().max(30).nullable(),
    reminderTime: time.nullable(),
    archivedAt: ms.nullable(),
    order: z.number(),
  }),
  /** One per habit per local day (deterministic id). */
  habitLogs: z.object({
    habitId: id,
    date: day,
    value: z.number().min(0).max(100000),
    note: z.string().max(500).nullable(),
  }),
  /**
   * Phase 1D (PRD §9): an append-only XP ledger with one entry per source (deterministic id),
   * so the same completion on two devices is awarded once. Undoing deletes the entry.
   */
  xpEvents: z.object({
    source: z.enum(["task", "focus", "ritual", "habit", "milestone", "goal", "checkin", "win", "penalty"]),
    sourceId: z.string().max(80),
    areaId: ref,
    amount: z.number().int().min(-1000).max(100000),
    reason: z.string().max(200),
    at: ms,
  }),
  /** One-off reminders the device schedules (e.g. a focus session ending); the server delivers them. */
  reminders: z.object({
    kind: z.enum(["focus_end", "custom"]),
    title: z.string().max(120),
    body: z.string().max(300),
    url: z.string().max(200),
    fireAt: ms,
    status: z.enum(["pending", "cancelled"]),
  }),
  focusSessions: z.object({
    taskId: id,
    mode: z.enum(["five", "pomodoro", "fixed", "open"]),
    plannedMinutes: z
      .number()
      .min(0)
      .max(24 * 60)
      .nullable(),
    startedAt: ms,
    endedAt: ms.nullable(),
    actualMinutes: z
      .number()
      .min(0)
      .max(24 * 60),
    outcome: z.enum(["done", "progress", "stuck", "abandoned"]).nullable(),
    interruptions: z.number().int().min(0).max(10000),
    // The live timer, synced so every device shows (and can control) a running session.
    // Optional: sessions from before this change only have the fields above.
    plannedMs: z
      .number()
      .int()
      .min(0)
      .max(48 * 3_600_000)
      .nullable()
      .optional(),
    pausedAt: ms.nullable().optional(),
    pausedMs: z.number().int().min(0).optional(),
    breakEndsAt: ms.nullable().optional(),
  }),
  /** Phase 2A: AI coach conversations. */
  aiThreads: z.object({
    title: z.string().trim().max(200),
    lastMessageAt: ms,
    archivedAt: ms.nullable(),
  }),
  /**
   * One entry in a conversation, kept exactly as sent to / returned by the API (append-only, so
   * thinking blocks stay valid). `system` entries carry the per-turn context and aren't shown.
   */
  aiMessages: z.object({
    threadId: id,
    seq: z.number().int().min(0).max(100000),
    role: z.enum(["user", "assistant", "system"]),
    content: z
      .array(z.record(z.string(), z.any()))
      .max(200)
      .refine((v) => JSON.stringify(v).length <= 200_000, "too large"),
    at: ms,
  }),
  /**
   * Phase 2A.2 (PRD §10.5): every change the coach makes or suggests, with before/after snapshots
   * of each document it touched, so it can be shown, accepted and undone.
   */
  aiActions: z.object({
    threadId: ref,
    toolUseId: z.string().max(100).nullable(),
    tool: z.string().max(60),
    input: z.record(z.string(), z.any()).refine((v) => JSON.stringify(v).length <= 20_000, "too large"),
    summary: z.string().max(300),
    status: z.enum(["proposed", "applied", "undone", "dismissed"]),
    changes: z
      .array(
        z.object({
          entity: z.string().max(40),
          id,
          before: z.record(z.string(), z.any()).nullable(),
          after: z.record(z.string(), z.any()),
        }),
      )
      .max(500)
      .refine((v) => JSON.stringify(v).length <= 150_000, "too large"),
    at: ms,
    undoneAt: ms.nullable(),
  }),
  /**
   * Phase 2B: calendars of the user's connected Google / iCloud accounts. Written by the server;
   * a device may only change `selected` (which calendars Orbit shows).
   */
  calendars: z.object({
    accountId: z.string().max(60),
    provider: z.enum(["google", "caldav"]),
    name: z.string().max(300),
    color: z.string().max(20),
    selected: z.boolean(),
    isOrbit: z.boolean(),
    readOnly: z.boolean(),
  }),
  /** Events from those calendars (read-only in Orbit; the calendar is the source of truth). */
  calendarEvents: z.object({
    calendarId: id,
    title: z.string().max(500),
    /** Instants (ms). For all-day events, UTC midnight of startDay / endDay. */
    start: ms,
    end: ms,
    allDay: z.boolean(),
    /** All-day events only: first day, and the day after the last (exclusive). */
    startDay: day.nullable(),
    endDay: day.nullable(),
    location: z.string().max(500).nullable(),
    status: z.enum(["confirmed", "tentative"]),
    link: z.string().max(2000).nullable(),
  }),
  /**
   * Phase 2B.2: time set aside for a task (CAL-4). Made on any device; the server mirrors each one
   * to the "Orbit" calendar, and a block moved or deleted there comes back here.
   */
  timeBlocks: z.object({
    taskId: ref,
    title: z.string().trim().min(1).max(500),
    start: ms,
    end: ms,
  }),
  /** Phase 2C (REL-1/2): the people who matter. "Last in touch" comes from `interactions`. */
  people: z.object({
    name: z.string().trim().min(1).max(120),
    /** Shown instead of initials when set. */
    emoji: z.string().max(16).nullable(),
    color: z.enum(AREA_COLORS),
    relationship: z.enum(RELATIONSHIPS),
    howWeMet: z.string().max(2000),
    notes: z.string().max(20000),
    interests: z.array(z.string().trim().min(1).max(60)).max(30),
    phone: z.string().trim().max(40).nullable(),
    whatsapp: z.string().trim().max(40).nullable(),
    email: z.string().trim().max(200).nullable(),
    /** Keep in touch every N days; null = no cadence (never in Reach out). */
    cadenceDays: z.number().int().min(1).max(730).nullable(),
    /** Out of Reach out until this day. */
    snoozedUntil: day.nullable(),
    dates: z.array(personDateSchema).max(20),
    areaId: ref,
    /** Set when imported from Google Contacts, so importing again skips them. */
    googleId: z.string().max(200).nullable(),
    archivedAt: ms.nullable(),
  }),
  /** REL-4: a call, message or meeting; the newest is "last in touch". */
  interactions: z.object({
    personId: id,
    date: day,
    type: z.enum(INTERACTION_TYPES),
    notes: z.string().max(5000),
  }),
  /** REL-5: gift ideas and things to remember about someone. */
  personItems: z.object({
    personId: id,
    kind: z.enum(["gift", "remember"]),
    text: z.string().trim().min(1).max(500),
    doneAt: ms.nullable(),
  }),
  /** What the coach remembers about the user (AI-9); visible and editable. */
  aiMemories: z.object({
    text: z.string().trim().min(1).max(500),
    source: z.enum(["user", "coach"]),
    archivedAt: ms.nullable(),
  }),
} as const;

export type EntityName = keyof typeof entitySchemas;

/**
 * Entities the server owns: devices may only write these fields (and never create or delete).
 * Server code applying its own changes passes `trusted`.
 */
export const DEVICE_WRITABLE: Partial<Record<EntityName, ReadonlySet<string>>> = {
  calendars: new Set(["selected"]),
  calendarEvents: new Set(),
};
export const ENTITY_NAMES = Object.keys(entitySchemas) as [EntityName, ...EntityName[]];

export type EntityFields<E extends EntityName> = z.infer<(typeof entitySchemas)[E]>;

/** Fields every synced document carries, on the client and in pull responses. */
export interface SyncMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  serverVersion: number;
}

/** Server-assigned fields beyond SyncMeta, per entity. */
interface ServerFields {
  tasks: { number?: number };
}

export type SyncedDoc<E extends EntityName> = SyncMeta &
  EntityFields<E> &
  (E extends keyof ServerFields ? ServerFields[E] : unknown);

/** Reference fields and the entity they point at — the server checks ownership. */
export const REFERENCES: Partial<Record<EntityName, Record<string, EntityName>>> = {
  goals: { areaId: "areas" },
  keyResults: { goalId: "goals" },
  krCheckins: { keyResultId: "keyResults", goalId: "goals" },
  milestones: { goalId: "goals" },
  tasks: {
    areaId: "areas",
    goalId: "goals",
    milestoneId: "milestones",
    parentTaskId: "tasks",
    recurrenceParentId: "tasks",
    cycleId: "cycles",
    personId: "people",
  },
  taskEvents: { taskId: "tasks" },
  focusSessions: { taskId: "tasks" },
  rituals: { cycleId: "cycles" },
  habits: { areaId: "areas", goalId: "goals" },
  habitLogs: { habitId: "habits" },
  xpEvents: { areaId: "areas" },
  aiMessages: { threadId: "aiThreads" },
  aiActions: { threadId: "aiThreads" },
  calendarEvents: { calendarId: "calendars" },
  timeBlocks: { taskId: "tasks" },
  people: { areaId: "areas" },
  interactions: { personId: "people" },
  personItems: { personId: "people" },
};
