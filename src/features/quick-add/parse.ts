import * as chrono from "chrono-node";
import { dayOf, type Day } from "@/lib/dates";
import type { Priority } from "@/features/tasks/model";

export interface QuickAddToken {
  kind: "date" | "priority" | "area" | "goal";
  /** The exact text in the input this token came from. */
  text: string;
  label: string;
}

export interface QuickAddResult {
  title: string;
  dueDate: Day | null;
  priority: Priority | null;
  areaId: string | null;
  goalId: string | null;
  tokens: QuickAddToken[];
}

interface Named {
  id: string;
}

const PRIORITY_TOKENS: Record<string, Priority> = { "1": "urgent", "2": "high", "3": "medium", "4": "low" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Parses natural language in Quick Add (PRD INB-2):
 * "Send CV tomorrow !2 #career +senior" → title "Send CV", due tomorrow, high priority,
 * Career area, the goal whose title starts with "senior".
 * Only dates with a certain day are taken (so "Review budget for November" stays a title).
 */
export function parseQuickAdd(
  input: string,
  ctx: {
    areas: (Named & { name: string })[];
    goals: (Named & { title: string })[];
    timezone: string;
    now?: Date;
  },
): QuickAddResult {
  const tokens: QuickAddToken[] = [];
  let text = ` ${input} `;
  let priority: Priority | null = null;
  let areaId: string | null = null;
  let goalId: string | null = null;
  let dueDate: Day | null = null;

  text = text.replace(/\s!([1-4])(?=\s)/g, (whole, n: string) => {
    if (priority) return whole;
    priority = PRIORITY_TOKENS[n];
    tokens.push({ kind: "priority", text: whole.trim(), label: ["", "Urgent", "High", "Medium", "Low"][Number(n)] });
    return " ";
  });

  text = text.replace(/\s#([\p{L}\p{N}_-]+)(?=\s)/gu, (whole, word: string) => {
    if (areaId) return whole;
    const match = ctx.areas.find((a) => norm(a.name).startsWith(norm(word)));
    if (!match) return whole;
    areaId = match.id;
    tokens.push({ kind: "area", text: whole.trim(), label: match.name });
    return " ";
  });

  text = text.replace(/\s\+([\p{L}\p{N}_-]+)(?=\s)/gu, (whole, word: string) => {
    if (goalId) return whole;
    const w = norm(word);
    const match =
      ctx.goals.find((g) => norm(g.title).startsWith(w)) ??
      ctx.goals.find((g) =>
        g.title
          .toLowerCase()
          .split(/\s+/)
          .some((part) => norm(part).startsWith(w)),
      );
    if (!match) return whole;
    goalId = match.id;
    tokens.push({ kind: "goal", text: whole.trim(), label: match.title });
    return " ";
  });

  const ref = ctx.now ?? new Date();
  const result = chrono
    .parse(text, ref, { forwardDate: true })
    .find((r) => r.start.isCertain("day") || r.start.isCertain("weekday"));
  if (result) {
    dueDate = dayOf(result.start.date(), ctx.timezone);
    tokens.push({ kind: "date", text: result.text, label: result.text });
    text = text.slice(0, result.index) + text.slice(result.index + result.text.length);
  }

  return {
    title: text.replace(/\s+/g, " ").trim(),
    dueDate,
    priority,
    areaId,
    goalId,
    tokens,
  };
}
