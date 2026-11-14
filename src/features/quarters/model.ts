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

// ---------------------------------------------------------------- rituals (QTR-2, QTR-4, RIT-7)

type QuarterState = Pick<Quarter, "year" | "q" | "committedAt" | "reviewCompletedAt" | "planningOverride">;

/** Planning a quarter with less than this many days left isn't worth a ritual. */
export const MIN_PLAN_DAYS = 14;
/** The next quarter can be planned in the current one's last week. */
export const PLAN_AHEAD_DAYS = 7;

export interface DueQuarterRitual {
  type: "quarterly_plan" | "quarterly_review";
  quarter: QuarterRef;
  /** The ritual's date (one per quarter): the quarter's first day for a plan, its last for a review. */
  date: Day;
  /** Planning partway through a quarter: a shorter plan (1–3 goals for the weeks left). */
  short?: boolean;
  missed?: boolean;
}

const find = (quarters: QuarterState[], ref: QuarterRef) => quarters.find((x) => x.year === ref.year && x.q === ref.q);

/**
 * Which quarterly rituals are waiting:
 * - the Review on the quarter's last day (from the review time), and every day after until done,
 *   for a quarter that was planned;
 * - the Plan for the current quarter while it isn't committed and has at least two weeks left
 *   (shortened once a third of it has gone), and for the next quarter in this one's last week.
 */
export function dueQuarterRituals(opts: {
  quarters: QuarterState[];
  today: Day;
  time: string;
  reviewTime: string;
}): DueQuarterRitual[] {
  const out: DueQuarterRitual[] = [];
  const now = quarterOf(opts.today);
  const nowDates = quarterDates(now);
  for (const ref of [addQuarters(now, -1), now]) {
    const d = quarterDates(ref);
    const doc = find(opts.quarters, ref);
    if (!doc?.committedAt || doc.reviewCompletedAt) continue;
    const ended = d.endDate < opts.today;
    if (ended || (d.endDate === opts.today && opts.time >= opts.reviewTime)) {
      out.push({ type: "quarterly_review", quarter: ref, date: d.endDate, missed: ended });
    }
  }
  const left = quarterDaysLeft(nowDates, opts.today);
  if (!find(opts.quarters, now)?.committedAt && left >= MIN_PLAN_DAYS) {
    out.push({
      type: "quarterly_plan",
      quarter: now,
      date: nowDates.startDate,
      short: elapsedShare(nowDates, opts.today) > 1 / 3,
    });
  }
  const next = addQuarters(now, 1);
  if (left < PLAN_AHEAD_DAYS && !find(opts.quarters, next)?.committedAt) {
    out.push({ type: "quarterly_plan", quarter: next, date: quarterDates(next).startDate });
  }
  return out;
}

export type QuarterGate = { blocked: false } | { blocked: true; canOverride: boolean; quarter: QuarterRef };

/**
 * QTR-4 / §8.5: a planned quarter that ended without a review blocks planning the next one. Firm
 * allows an override with a reason; Strict doesn't; Gentle never blocks. Its last day is review day.
 */
export function quarterPlanningGate(
  quarters: QuarterState[],
  target: QuarterRef,
  today: Day,
  strictness: "gentle" | "firm" | "strict",
): QuarterGate {
  if (strictness === "gentle") return { blocked: false };
  const prevRef = addQuarters(target, -1);
  const prev = find(quarters, prevRef);
  if (!prev?.committedAt || prev.reviewCompletedAt || quarterDates(prevRef).endDate >= today) return { blocked: false };
  if (strictness === "firm" && find(quarters, target)?.planningOverride) return { blocked: false };
  return { blocked: true, canOverride: strictness === "firm", quarter: prevRef };
}

/** Months (first day, last day) of the quarter from `from` on, for monthly milestones. */
export function monthsLeft(ref: QuarterRef, from: Day): { label: string; end: Day }[] {
  const d = quarterDates(ref);
  const out: { label: string; end: Day }[] = [];
  for (let m = 0; m < 3; m++) {
    const month = (ref.q - 1) * 3 + 1 + m;
    const next = month === 12 ? `${ref.year + 1}-01-01` : `${ref.year}-${String(month + 1).padStart(2, "0")}-01`;
    const end = addDays(next, -1);
    if (end < from || end < d.startDate) continue;
    out.push({
      label: new Date(Date.UTC(ref.year, month - 1, 1)).toLocaleDateString(undefined, {
        month: "long",
        timeZone: "UTC",
      }),
      end,
    });
  }
  return out;
}
