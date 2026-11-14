import { z } from "zod";

/**
 * The coach's tools (PRD §10.2). Shared by the server (which tells the model about them) and the
 * device (which runs them with the same actions as the UI — decision 2 in docs/phases/phase-2a.md).
 *
 * Keep the order and wording stable: the tool list is part of the cached prompt prefix.
 */
const id = z.string().regex(/^[0-9A-Za-z]{10,40}$/);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A date, YYYY-MM-DD");
const priority = z.enum(["urgent", "high", "medium", "low", "none"]);
const effort = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8)])
  .describe("Points: 1, 2, 3, 5 or 8");
const schedule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({
    type: z.literal("days"),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7).describe("0 = Sunday … 6 = Saturday"),
  }),
  z.object({ type: z.literal("weekly"), timesPerWeek: z.number().int().min(1).max(7) }),
]);
const taskFields = {
  description: z.string().max(5000).optional(),
  priority: priority.optional(),
  effort: effort.nullable().optional(),
  areaId: id.nullable().optional(),
  goalId: id.nullable().optional(),
  milestoneId: id.nullable().optional(),
  dueDate: day.nullable().optional().describe("Deadline, YYYY-MM-DD"),
  scheduledDate: day.nullable().optional().describe("The day they plan to do it, YYYY-MM-DD"),
  nextStep: z.string().trim().max(300).nullable().optional().describe("The very next physical action, ~2 minutes"),
};

export const COACH_TOOLS = {
  get_overview: {
    description:
      "Get the user's current situation: today's date and plan (Must-dos, due and overdue tasks, habits due), the current cycle with its commitment and progress, active goals with health, and level. Call this first when the question is about how things are going or what to do next.",
    input: z.object({}),
  },
  search: {
    description:
      "Search the user's tasks, goals and habits by words in their title. Returns up to 20 matches with ids. Open tasks only unless includeDone is true.",
    input: z.object({
      query: z.string().trim().min(1).max(100).describe("Words to look for in titles"),
      kinds: z
        .array(z.enum(["task", "goal", "habit"]))
        .optional()
        .describe("Limit to these kinds; all kinds when left out"),
      includeDone: z.boolean().optional().describe("Also return done and cancelled tasks"),
    }),
  },
  get_task: {
    description:
      "Get one task with its details, subtasks and recent history. Pass its id, or its number (ORB-142 is number 142).",
    input: z.object({
      id: id.optional(),
      number: z.number().int().min(1).optional(),
    }),
  },
  get_goal: {
    description: "Get one goal with its key results, milestones and open tasks.",
    input: z.object({ id }),
  },
  create_goal: {
    description:
      "Create a goal. Give it a clear outcome as the title. Use areaId from get_overview's areas. Status is active unless they say it's for later.",
    input: z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(),
      areaId: id.nullable().optional(),
      status: z.enum(["planned", "active"]).optional(),
      priority: priority.optional(),
      startDate: day.nullable().optional(),
      targetDate: day.nullable().optional(),
    }),
  },
  update_goal: {
    description:
      "Change a goal: title, description, status, health, priority or dates. Setting status to dropped needs a reason and always asks the user first.",
    input: z.object({
      id,
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      status: z.enum(["planned", "active", "paused", "completed", "dropped"]).optional(),
      health: z.enum(["on_track", "at_risk", "off_track"]).nullable().optional(),
      priority: priority.optional(),
      startDate: day.nullable().optional(),
      targetDate: day.nullable().optional(),
      droppedReason: z.string().trim().max(500).optional(),
    }),
  },
  add_key_result: {
    description: "Add a measurable key result to a goal (number, percent, or yes/no).",
    input: z.object({
      goalId: id,
      title: z.string().trim().min(1).max(200),
      type: z.enum(["number", "percent", "boolean"]),
      start: z.number().default(0),
      target: z.number(),
      unit: z.string().trim().max(20).nullable().optional(),
    }),
  },
  checkin_key_result: {
    description: "Record a key result's new current value (a check-in).",
    input: z.object({ id, value: z.number(), note: z.string().max(500).nullable().optional() }),
  },
  add_milestone: {
    description: "Add a milestone (a checkpoint on the way) to a goal.",
    input: z.object({ goalId: id, title: z.string().trim().min(1).max(200), dueDate: day.nullable().optional() }),
  },
  create_task: {
    description:
      "Create a task. Status todo by default (inbox if it still needs sorting). Link it to a goal or milestone when it serves one. Set scheduledDate only if they want it on a particular day.",
    input: z.object({
      title: z.string().trim().min(1).max(500),
      status: z.enum(["inbox", "backlog", "todo", "in_progress"]).optional(),
      parentTaskId: id.nullable().optional().describe("Makes it a subtask of this task"),
      ...taskFields,
    }),
  },
  update_task: {
    description: "Change a task's details (title, priority, effort, links, dates, next step, status).",
    input: z.object({
      id,
      title: z.string().trim().min(1).max(500).optional(),
      status: z.enum(["inbox", "backlog", "todo", "in_progress", "done", "cancelled"]).optional(),
      ...taskFields,
    }),
  },
  complete_task: {
    description: "Mark a task done (only when they say it is).",
    input: z.object({ id }),
  },
  reschedule_task: {
    description:
      "Move a task to another day (or off the plan with to = null), recording why, like the app's skip flow. Use their reason when they gave one.",
    input: z.object({
      id,
      to: day.nullable(),
      reason: z
        .enum(["too_big", "unclear", "no_time", "low_energy", "waiting", "avoiding", "not_important", "other"])
        .nullable()
        .optional(),
      reasonText: z.string().max(500).optional(),
    }),
  },
  create_habit: {
    description: "Create a habit with a schedule (daily, certain weekdays, or N times a week).",
    input: z.object({
      name: z.string().trim().min(1).max(120),
      schedule,
      targetType: z.enum(["boolean", "count"]).optional(),
      targetCount: z.number().int().min(1).max(100000).optional(),
      unit: z.string().trim().max(30).nullable().optional(),
      reminderTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .nullable()
        .optional()
        .describe("HH:MM local time"),
      areaId: id.nullable().optional(),
      goalId: id.nullable().optional(),
    }),
  },
  update_habit: {
    description: "Change a habit, or archive it (archived: true).",
    input: z.object({
      id,
      name: z.string().trim().min(1).max(120).optional(),
      schedule: schedule.optional(),
      targetCount: z.number().int().min(1).max(100000).optional(),
      reminderTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .nullable()
        .optional(),
      archived: z.boolean().optional(),
    }),
  },
  create_reminder: {
    description: "Set a one-off push reminder at a local date and time, e.g. 'remind me to call mum on Saturday at 5'.",
    input: z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().max(300).optional(),
      date: day,
      time: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .describe("HH:MM, 24-hour, their local time"),
    }),
  },
  cancel_reminder: {
    description: "Cancel a reminder you set (its id is in get_overview's reminders).",
    input: z.object({ id }),
  },
  remember: {
    description:
      "Save a short note about the user that will help later (a preference, context, what works for them). Only things they would be happy for you to remember; they can see and edit these notes.",
    input: z.object({ text: z.string().trim().min(1).max(500) }),
  },
  forget: {
    description: "Remove a note you saved with remember (its id is shown in the context).",
    input: z.object({ id }),
  },
} as const;

export type CoachToolName = keyof typeof COACH_TOOLS;

/** Tools that change the user's data: recorded, undoable, and subject to the autonomy setting. */
export const WRITE_TOOLS = new Set<CoachToolName>([
  "create_goal",
  "update_goal",
  "add_key_result",
  "checkin_key_result",
  "add_milestone",
  "create_task",
  "update_task",
  "complete_task",
  "reschedule_task",
  "create_habit",
  "update_habit",
  "create_reminder",
  "cancel_reminder",
]);

/** More changes than this in one reply need the user's OK first (PRD §10.5). */
export const BULK_LIMIT = 10;

export function isCoachTool(name: string): name is CoachToolName {
  return Object.hasOwn(COACH_TOOLS, name);
}

/** Tool definitions in the API's format, in a fixed order. */
export function toolDefinitions() {
  return (Object.keys(COACH_TOOLS) as CoachToolName[]).map((name) => {
    const { $schema: _ignored, ...input_schema } = z.toJSONSchema(COACH_TOOLS[name].input) as Record<string, unknown>;
    return {
      name,
      description: COACH_TOOLS[name].description,
      input_schema: { ...input_schema, type: "object" as const },
      eager_input_streaming: true,
    };
  });
}
