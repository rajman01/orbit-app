import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Db } from "mongodb";
import { z } from "zod";
import { capturedTaskSchema, type CapturedTask } from "@/features/coach/capture";
import { coachModels, recordUsage } from "./server";

/**
 * AI-8: messy text (notes, a list, an email) → tasks for the Inbox. One structured-output call to
 * the light model; the device shows the result for review before anything is created.
 */

// Every field is present (null when unknown): simple for structured outputs, checked again below.
const outputSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable(),
      scheduledDate: z.string().nullable(),
      priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
      effort: z.number().nullable(),
      notes: z.string().nullable(),
    }),
  ),
});

const SYSTEM = `You turn messy text from a personal task manager's quick capture into separate, actionable tasks.
- One task per distinct action. Start each title with a verb, keep their wording, under 80 characters. Drop filler ("I need to", "don't forget").
- Dates: dueDate only for a real deadline ("by Friday", "due 3rd"); scheduledDate when they say when they'll do it ("tomorrow", "on Saturday"). Resolve relative dates from today's date given below, format YYYY-MM-DD. Otherwise null.
- priority only if they signal it (urgent, asap, important); effort (1, 2, 3, 5 or 8 points) only if the size is obvious; otherwise null.
- notes: useful detail that doesn't fit the title (a phone number, a link, who it's for); otherwise null.
- Ignore text that isn't something to do. If there is nothing actionable, return an empty list.`;

let client: Anthropic | undefined;

export async function parseCapture(db: Db, userId: string, text: string, today: string): Promise<CapturedTask[]> {
  if (process.env.COACH_FAKE === "1") return fakeParse(text);
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: coachModels().light,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(outputSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Today is ${today}.\n\nCapture:\n${text}` }],
  });
  await recordUsage(db, userId, response.usage, "light").catch(() => {});
  if (response.stop_reason === "refusal" || !response.parsed_output) return [];
  return clean(response.parsed_output.tasks);
}

/** Keeps only valid tasks, with values the app accepts (dates, effort points). */
function clean(tasks: z.infer<typeof outputSchema>["tasks"]): CapturedTask[] {
  const out: CapturedTask[] = [];
  for (const t of tasks.slice(0, 30)) {
    const effort = [1, 2, 3, 5, 8].includes(t.effort ?? -1) ? (t.effort as CapturedTask["effort"]) : null;
    const date = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    const parsed = capturedTaskSchema.safeParse({
      title: t.title.trim().slice(0, 300),
      dueDate: date(t.dueDate),
      scheduledDate: date(t.scheduledDate),
      priority: t.priority ?? "none",
      effort,
      notes: t.notes?.trim().slice(0, 2000) || null,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Tests (COACH_FAKE=1): one task per line or semicolon, no network. */
function fakeParse(text: string): CapturedTask[] {
  return text
    .split(/\n|;/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .map((title) => ({ title, dueDate: null, scheduledDate: null, priority: "none", effort: null, notes: null }));
}
