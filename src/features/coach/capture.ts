import { z } from "zod";

/** A task the coach pulled out of captured text (AI-8), before the user adds it to the Inbox. */
export const capturedTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]),
  effort: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8)]).nullable(),
  notes: z.string().max(2000).nullable(),
});
export type CapturedTask = z.infer<typeof capturedTaskSchema>;

export const captureRequestSchema = z.object({
  text: z.string().trim().min(1).max(5000),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
