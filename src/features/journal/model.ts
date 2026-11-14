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
