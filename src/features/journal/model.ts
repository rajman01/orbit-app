import type { Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";

export type JournalEntry = SyncedDoc<"journalEntries">;
export type JournalFields = EntityFields<"journalEntries">;

/** One entry per day, the same id on every device (so the Shutdown and the Journal page agree). */
export function journalId(userId: string, date: Day): string {
  return `j${date.replaceAll("-", "")}${userId}`.slice(0, 40);
}

export function emptyEntry(date: Day): JournalFields {
  return { date, text: "", mood: null, energy: null, prompts: [] };
}

export const MOOD = ["Rough", "Meh", "Okay", "Good", "Great"];
export const ENERGY = ["Drained", "Low", "Steady", "Good", "Buzzing"];

/** JRN-2: the prompt library. */
export const PROMPTS: { id: string; group: string; text: string }[] = [
  { id: "grateful", group: "Gratitude", text: "Three things I'm grateful for today" },
  { id: "person", group: "Gratitude", text: "Someone who made today better, and how" },
  { id: "well", group: "Reflection", text: "What went well, and why?" },
  { id: "blocked", group: "Reflection", text: "What got in my way?" },
  { id: "learned", group: "Reflection", text: "What did I learn today?" },
  { id: "proud", group: "Reflection", text: "Something I'm proud of" },
  { id: "energy", group: "Energy", text: "What gave me energy, and what drained it?" },
  { id: "avoid", group: "Honesty", text: "What am I avoiding, and what's the smallest step towards it?" },
  { id: "worry", group: "Honesty", text: "What's on my mind that I haven't said out loud?" },
  { id: "tomorrow", group: "Looking ahead", text: "What would make tomorrow a good day?" },
  { id: "future", group: "Looking ahead", text: "What would future me thank me for doing this week?" },
];

/** Adds the Shutdown's line to the day's text unless it's already there. */
export function withLine(text: string, line: string): string {
  const l = line.trim();
  if (!l || text.includes(l)) return text;
  return text.trim() ? `${text.trimEnd()}\n\n${l}` : l;
}

// ---------------------------------------------------------------- JRN-3: search and calendar

export interface JournalHit {
  date: string;
  mood: number | null;
  energy: number | null;
  /** A short piece of the text around the first match (or the start). */
  snippet: string;
}

/**
 * Entries matching every word of the query (case- and accent-insensitive) and the mood filter,
 * newest first, with a snippet around the first match.
 */
export function searchJournal(
  entries: { date: string; text: string; mood: number | null; energy: number | null; deletedAt?: number | null }[],
  query: string,
  mood: number | null = null,
): JournalHit[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const words = norm(query).split(/\s+/).filter(Boolean);
  return entries
    .filter((e) => e.deletedAt == null && (e.text.trim() || e.mood || e.energy))
    .filter((e) => mood == null || e.mood === mood)
    .filter((e) => words.every((w) => norm(e.text).includes(w)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => {
      const text = e.text.replace(/\s+/g, " ").trim();
      const at = words.length ? norm(text).indexOf(words[0]) : 0;
      const start = Math.max(0, at - 40);
      const snippet = `${start > 0 ? "…" : ""}${text.slice(start, start + 160)}${start + 160 < text.length ? "…" : ""}`;
      return { date: e.date, mood: e.mood, energy: e.energy, snippet };
    });
}

/** A month as weeks of days (null outside the month), starting on the user's week start. */
export function monthGrid(month: string, weekStart: number): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const lead = (first - weekStart + 7) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
