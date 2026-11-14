import { addDays, daysBetween, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";

export type Quarter = SyncedDoc<"quarters">;
export type QuarterFields = EntityFields<"quarters">;
export type Vision = SyncedDoc<"vision">;
export type VisionFields = EntityFields<"vision">;
export type CoreValue = VisionFields["values"][number];

export interface QuarterRef {
  year: number;
  q: number;
}

/** Calendar quarters (D34): Q1 = January–March. */
export function quarterOf(day: Day): QuarterRef {
  return { year: Number(day.slice(0, 4)), q: Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1 };
}

export function quarterDates({ year, q }: QuarterRef): { startDate: Day; endDate: Day } {
  const m = (q - 1) * 3 + 1;
  const start = `${year}-${String(m).padStart(2, "0")}-01`;
  const next = q === 4 ? `${year + 1}-01-01` : `${year}-${String(m + 3).padStart(2, "0")}-01`;
  return { startDate: start, endDate: addDays(next, -1) };
}

/** "2026-Q4", used in URLs. */
export const quarterKey = ({ year, q }: QuarterRef) => `${year}-Q${q}`;

export function parseQuarterKey(key: string | null | undefined): QuarterRef | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key ?? "");
  return m ? { year: Number(m[1]), q: Number(m[2]) } : null;
}

export const quarterLabel = ({ year, q }: QuarterRef) => `Q${q} ${year}`;

export function addQuarters({ year, q }: QuarterRef, n: number): QuarterRef {
  const i = year * 4 + (q - 1) + n;
  return { year: Math.floor(i / 4), q: (i % 4) + 1 };
}

/** The same id on every device, so quarters made offline on two devices are the same document. */
export function quarterId(userId: string, { year, q }: QuarterRef): string {
  return `q${year}${q}${userId}`.slice(0, 40);
}

export function visionId(userId: string): string {
  return `v${userId}`.slice(0, 40);
}

export function newQuarterFields(ref: QuarterRef): QuarterFields {
  return {
    ...ref,
    ...quarterDates(ref),
    theme: null,
    goalIds: [],
    committedAt: null,
    reviewCompletedAt: null,
    reflection: null,
    planningOverride: null,
  };
}

export function emptyVision(): VisionFields {
  return { values: [], oneYear: "", fiveYear: "", tenYear: "", themes: [] };
}

export function yearTheme(vision: Pick<VisionFields, "themes"> | null | undefined, year: number): string {
  return vision?.themes.find((t) => t.year === year)?.theme ?? "";
}

/** How much of the quarter has gone by on `today` (0 before it starts, 1 once it's over). */
export function elapsedShare(dates: { startDate: Day; endDate: Day }, today: Day): number {
  const total = daysBetween(dates.startDate, dates.endDate) + 1;
  const done = daysBetween(dates.startDate, today) + 1;
  return Math.min(1, Math.max(0, done / total));
}

export function quarterDaysLeft(dates: { endDate: Day }, today: Day): number {
  return Math.max(0, daysBetween(today, dates.endDate));
}

export type Pace = "on_pace" | "behind";

/** QTR-6: behind when progress trails the time gone by more than 20 points. */
export function pace(progress: number, elapsed: number): Pace {
  return progress * 100 < elapsed * 100 - 20 ? "behind" : "on_pace";
}

/** Cycles that start in the quarter (the last one can run a few days past its end). */
export function cyclesInQuarter<C extends { startDate: Day }>(cycles: C[], dates: { startDate: Day; endDate: Day }) {
  return cycles.filter((c) => c.startDate >= dates.startDate && c.startDate <= dates.endDate);
}

/** A short id for a new value. */
export function newValueId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(6, "0");
}
