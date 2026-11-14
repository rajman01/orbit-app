import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";

export type Win = SyncedDoc<"wins">;
export type WinFields = EntityFields<"wins">;

/** One win per completed task, so "Log as win" twice doesn't duplicate it. */
export const taskWinId = (taskId: string) => `wt${taskId}`.slice(0, 40);
/** Wins written in a review: one per line, per ritual. */
export const ritualWinId = (ritualId: string, i: number) => `w${i}${ritualId}`.slice(0, 40);

export function newWinFields(partial: Partial<WinFields> & { title: string; date: string }): WinFields {
  return {
    description: "",
    impact: "",
    areaId: null,
    goalId: null,
    taskId: null,
    links: [],
    source: "manual",
    ...partial,
  };
}

const monthLabel = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** CAR-1: the wins log as markdown (a brag doc), newest month first. */
export function winsMarkdown(
  wins: Pick<Win, "date" | "title" | "description" | "impact" | "links" | "areaId" | "goalId">[],
  names: { areas: Map<string, string>; goals: Map<string, string> },
): string {
  const sorted = [...wins].sort((a, b) => b.date.localeCompare(a.date));
  const lines = ["# Wins", ""];
  let month = "";
  for (const w of sorted) {
    const m = monthLabel(w.date);
    if (m !== month) {
      month = m;
      lines.push(`## ${m}`, "");
    }
    const tags = [w.areaId && names.areas.get(w.areaId), w.goalId && names.goals.get(w.goalId)].filter(Boolean);
    lines.push(`- **${w.title}** (${w.date})${tags.length ? ` · ${tags.join(" · ")}` : ""}`);
    if (w.description.trim()) lines.push(`  ${w.description.trim().replace(/\n+/g, " ")}`);
    if (w.impact.trim()) lines.push(`  *Impact:* ${w.impact.trim().replace(/\n+/g, " ")}`);
    for (const l of w.links) lines.push(`  ${l}`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
