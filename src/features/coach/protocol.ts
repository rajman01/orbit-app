import { z } from "zod";

/** A message as the device sends it: the API's role + content blocks, kept verbatim. */
export const coachMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
});
export type CoachMessage = z.infer<typeof coachMessageSchema>;

export const coachRequestSchema = z.object({
  messages: z.array(coachMessageSchema).min(1).max(600),
});

/** Largest request body accepted (the device summarises or starts a new thread before this). */
export const MAX_COACH_REQUEST_BYTES = 1_500_000;

/**
 * The response is newline-delimited JSON:
 * - `{ t: "text", v }` a piece of the reply as it streams
 * - `{ t: "message", content, stopReason }` the finished assistant turn (store it verbatim)
 * - `{ t: "error", code, message }` something went wrong (nothing to store)
 */
export type CoachEvent =
  | { t: "text"; v: string }
  | { t: "message"; content: Record<string, unknown>[]; stopReason: string | null }
  | { t: "error"; code: "limit" | "setup" | "busy" | "failed"; message: string };
