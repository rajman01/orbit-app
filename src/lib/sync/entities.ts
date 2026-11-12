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
  }),
} as const;

export type EntityName = keyof typeof entitySchemas;
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
  },
  taskEvents: { taskId: "tasks" },
  focusSessions: { taskId: "tasks" },
};
