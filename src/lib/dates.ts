/**
 * Calendar-day helpers. A "day" is a `YYYY-MM-DD` string in the user's timezone;
 * day arithmetic happens in UTC on those strings so DST never shifts a date.
 */

export type Day = string;

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The calendar day of an instant in a timezone. */
export function dayOf(instant: Date | number, timezone: string): Day {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function today(timezone: string, now: number = Date.now()): Day {
  return dayOf(now, timezone);
}

function toUtc(day: Day): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): Day {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function addMonths(day: Day, n: number): Day {
  const d = toUtc(day);
  const target = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(target, daysInMonth));
  return fromUtc(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(day: Day): number {
  return toUtc(day).getUTCDay();
}

export function daysBetween(a: Day, b: Day): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** Short human label: Today, Tomorrow, Yesterday, weekday within a week, else "12 Nov". */
export function dayLabel(day: Day, todayDay: Day): string {
  const diff = daysBetween(todayDay, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = toUtc(day);
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
  const sameYear = day.slice(0, 4) === todayDay.slice(0, 4);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

export function longDayLabel(day: Day): string {
  return toUtc(day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
