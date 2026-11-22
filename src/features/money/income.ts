import type { Day } from "@/lib/dates";

/**
 * Expected income timing. A source lands on `day` (1–31; past the month's end it lands on the last
 * day, so 31 means "the last day of every month") in each month from `from` to `until` (YYYY-MM,
 * both optional and inclusive). A one-off payment has `from` and `until` set to the same month; a
 * run of instalments sets both ends. Kept free of other imports so the push server can use it.
 */

export interface IncomeTiming {
  day: number | null;
  from?: string | null;
  until?: string | null;
}

/** The pay day that means "the last day of the month". */
export const LAST_DAY = 31;

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Whether the source pays anything in `month` (YYYY-MM). */
export function incomeActiveIn(i: Pick<IncomeTiming, "from" | "until">, month: string): boolean {
  return (!i.from || month >= i.from) && (!i.until || month <= i.until);
}

/** The day of `month` it lands on, or null when it has no day. */
export function incomeDayIn(i: Pick<IncomeTiming, "day">, month: string): number | null {
  return i.day == null ? null : Math.min(i.day, daysInMonth(month));
}

/** The sources that land on `day`. */
export function incomesLandingOn<T extends IncomeTiming>(incomes: T[], day: Day): T[] {
  const month = day.slice(0, 7);
  const dom = Number(day.slice(8, 10));
  return incomes.filter((i) => incomeActiveIn(i, month) && incomeDayIn(i, month) === dom);
}

/** `month` plus `n` months, as YYYY-MM. */
export function addMonthsToMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortMonth(month: string, withYear: boolean) {
  const [y, m] = month.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "on the last day", "on the 20th · Jan–Apr 2027", "once, Nov 2026", "from Dec 2026". */
export function incomeTimingLabel(i: IncomeTiming): string | undefined {
  const day = i.day == null ? null : i.day >= LAST_DAY ? "on the last day" : `on the ${ordinal(i.day)}`;
  let span: string | null = null;
  if (i.from && i.until) {
    if (i.from === i.until) span = `once, ${shortMonth(i.from, true)}`;
    else {
      const sameYear = i.from.slice(0, 4) === i.until.slice(0, 4);
      span = `${shortMonth(i.from, !sameYear)}–${shortMonth(i.until, true)}`;
    }
  } else if (i.from) span = `from ${shortMonth(i.from, true)}`;
  else if (i.until) span = `until ${shortMonth(i.until, true)}`;
  return [day, span].filter(Boolean).join(" · ") || undefined;
}
