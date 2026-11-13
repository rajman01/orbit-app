import { z } from "zod";

/**
 * The coach's tools (PRD §10.2). Shared by the server (which tells the model about them) and the
 * device (which runs them with the same actions as the UI — decision 2 in docs/phases/phase-2a.md).
 *
 * Keep the order and wording stable: the tool list is part of the cached prompt prefix.
 */
const id = z.string().regex(/^[0-9A-Za-z]{10,40}$/);

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
