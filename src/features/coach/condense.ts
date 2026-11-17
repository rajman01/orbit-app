import { CHECKIN_MARK, type CoachMessage } from "./protocol";

/**
 * Phase 3H: long conversations (an item's conversation can run for weeks) are condensed. The
 * oldest messages are summarised once and the summary is sent in their place, so each request
 * stays small; the chat still shows everything.
 */

export interface StoredMessage extends CoachMessage {
  seq: number;
}
export interface ThreadSummary {
  text: string;
  upToSeq: number;
}

/** Starts the message that stands in for the summarised part. */
export const SUMMARY_MARK = "[Summary of the earlier conversation]";

/** Condense once more than this many messages (or this many bytes) would be sent… */
export const CONDENSE_AT = { messages: 120, bytes: 400_000 };
/** …keeping about this many of the newest as they are. */
export const KEEP_RECENT = 40;

const sentAfter = (rows: StoredMessage[], summary: ThreadSummary | null | undefined) =>
  summary ? rows.filter((m) => m.seq > summary.upToSeq) : rows;

/** A message the user typed (not tool results or a check-in's hidden facts): a safe place to cut. */
function startsExchange(m: CoachMessage): boolean {
  return (
    m.role === "user" &&
    m.content.some((b) => b.type === "text") &&
    !m.content.some((b) => b.type === "tool_result" || (b.type === "text" && String(b.text).startsWith(CHECKIN_MARK)))
  );
}

/** What to send: the summary (if any) in place of what it covers, then the rest as stored. */
export function withSummary(rows: StoredMessage[], summary: ThreadSummary | null | undefined): CoachMessage[] {
  const rest = sentAfter(rows, summary).map(({ role, content }) => ({ role, content }));
  if (!summary) return rest;
  return [{ role: "user", content: [{ type: "text", text: `${SUMMARY_MARK}\n${summary.text}` }] }, ...rest];
}

/**
 * Whether it's time to condense, and where to cut: just before a message the user typed, so the
 * kept part starts a clean exchange. Returns the messages to summarise, or null.
 */
export function condensePlan(
  rows: StoredMessage[],
  summary: ThreadSummary | null | undefined,
  limits = CONDENSE_AT,
  keep = KEEP_RECENT,
): { summarise: StoredMessage[]; upToSeq: number } | null {
  const sent = sentAfter(rows, summary);
  const big = sent.length > limits.messages || JSON.stringify(sent).length > limits.bytes;
  if (!big || sent.length <= keep) return null;
  for (let i = sent.length - keep; i > 0; i--) {
    if (startsExchange(sent[i])) return { summarise: sent.slice(0, i), upToSeq: sent[i - 1].seq };
  }
  return null;
}

/** The part to summarise as a plain transcript (what was said and what the coach changed). */
export function transcript(rows: CoachMessage[], maxChars = 60_000): string {
  const lines: string[] = [];
  for (const m of rows) {
    if (m.role === "system") continue;
    for (const b of m.content) {
      if (b.type === "text" && String(b.text).trim()) {
        const text = String(b.text).trim();
        if (text.startsWith(SUMMARY_MARK)) lines.push(`Earlier summary: ${text.slice(SUMMARY_MARK.length).trim()}`);
        else lines.push(`${m.role === "user" ? "User" : "Coach"}: ${text}`);
      } else if (b.type === "tool_use") {
        lines.push(`(Coach used ${String(b.name)} ${JSON.stringify(b.input ?? {}).slice(0, 300)})`);
      }
    }
  }
  const all = lines.join("\n");
  return all.length > maxChars ? all.slice(all.length - maxChars) : all;
}
