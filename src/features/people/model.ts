import { addDays, daysBetween, type Day } from "@/lib/dates";
import {
  AREA_COLORS,
  type EntityFields,
  type INTERACTION_TYPES,
  type PersonDate,
  type RELATIONSHIPS,
  type SyncedDoc,
} from "@/lib/sync/entities";

export type Person = SyncedDoc<"people">;
export type PersonFields = EntityFields<"people">;
export type Interaction = SyncedDoc<"interactions">;
export type PersonItem = SyncedDoc<"personItems">;
export type Relationship = (typeof RELATIONSHIPS)[number];
export type InteractionType = (typeof INTERACTION_TYPES)[number];
export type { PersonDate };

export const RELATIONSHIP_META: Record<Relationship, { label: string; plural: string }> = {
  family: { label: "Family", plural: "Family" },
  friend: { label: "Friend", plural: "Friends" },
  partner: { label: "Partner", plural: "Partner" },
  mentor: { label: "Mentor", plural: "Mentors" },
  colleague: { label: "Colleague", plural: "Colleagues" },
  other: { label: "Other", plural: "Others" },
};

export const INTERACTION_META: Record<InteractionType, { label: string; verb: string }> = {
  call: { label: "Call", verb: "Called" },
  text: { label: "Message", verb: "Messaged" },
  in_person: { label: "In person", verb: "Met" },
  other: { label: "Other", verb: "In touch" },
};

/** Keep-in-touch choices (REL-2); anything else is a custom number of days. */
export const CADENCES: { days: number | null; label: string }[] = [
  { days: null, label: "No reminder" },
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 91, label: "Every 3 months" },
];

export function cadenceLabel(days: number | null): string {
  const preset = CADENCES.find((c) => c.days === days);
  if (preset) return preset.label;
  return days === 1 ? "Every day" : `Every ${days} days`;
}

/** "Ada Lovelace" → "AL"; one name → its first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return [...words[0]].slice(0, 2).join("").toUpperCase();
  return ([...words[0]][0] + [...words[words.length - 1]][0]).toUpperCase();
}

/** A stable colour for a new person, from their name. */
export function colorFor(name: string): (typeof AREA_COLORS)[number] {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AREA_COLORS[h % AREA_COLORS.length];
}

export function newPersonFields(partial: Partial<PersonFields> & { name: string }): PersonFields {
  return {
    emoji: null,
    color: colorFor(partial.name),
    relationship: "friend",
    howWeMet: "",
    notes: "",
    interests: [],
    phone: null,
    whatsapp: null,
    email: null,
    cadenceDays: null,
    snoozedUntil: null,
    dates: [],
    areaId: null,
    googleId: null,
    archivedAt: null,
    ...partial,
  };
}

/** The most recent interaction's day, or null when nothing has been logged. */
export function lastInTouch(interactions: Pick<Interaction, "date" | "deletedAt">[]): Day | null {
  let last: Day | null = null;
  for (const i of interactions) if (!i.deletedAt && (last == null || i.date > last)) last = i.date;
  return last;
}

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "5 months ago", "over a year ago". */
export function agoLabel(day: Day, todayDay: Day): string {
  const n = daysBetween(day, todayDay);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  if (n < 365) return `${Math.round(n / 30.4)} months ago`;
  return n < 730 ? "Over a year ago" : `${Math.floor(n / 365)} years ago`;
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2000, i, 1)).toLocaleDateString(undefined, { month: "long", timeZone: "UTC" }),
);
export const monthName = (m: number) => MONTHS[m - 1];

const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The date in a given year; 29 February falls on 28 February in other years. */
function inYear(d: Pick<PersonDate, "month" | "day">, year: number): Day {
  const lastDay = new Date(Date.UTC(year, d.month, 0)).getUTCDate();
  const day = d.month === 2 && d.day === 29 && !isLeap(year) ? 28 : Math.min(d.day, lastDay);
  return `${year}-${pad(d.month)}-${pad(day)}`;
}

/** The next time this date comes round, today included. */
export function nextOccurrence(d: Pick<PersonDate, "month" | "day">, todayDay: Day): Day {
  const y = Number(todayDay.slice(0, 4));
  const thisYear = inYear(d, y);
  return thisYear >= todayDay ? thisYear : inYear(d, y + 1);
}

export function dateLabel(d: PersonDate): string {
  if (d.kind === "birthday") return "Birthday";
  if (d.kind === "anniversary") return d.label || "Anniversary";
  return d.label || "Date";
}

/** "14 March" or "14 March 1990". */
export function formatPersonDate(d: Pick<PersonDate, "month" | "day" | "year">): string {
  return `${d.day} ${monthName(d.month)}${d.year ? ` ${d.year}` : ""}`;
}

export interface UpcomingDate {
  date: PersonDate;
  on: Day;
  inDays: number;
  /** Birthday age or years since an anniversary, when the year is known. */
  turning: number | null;
}

export function upcomingDate(d: PersonDate, todayDay: Day): UpcomingDate {
  const on = nextOccurrence(d, todayDay);
  return {
    date: d,
    on,
    inDays: daysBetween(todayDay, on),
    turning: d.year ? Number(on.slice(0, 4)) - d.year : null,
  };
}

export function inDaysLabel(n: number): string {
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n < 7) return `In ${n} days`;
  if (n < 60) return `In ${Math.round(n / 7)} week${Math.round(n / 7) === 1 ? "" : "s"}`;
  return `In ${Math.round(n / 30.4)} months`;
}

/** When someone with a cadence is next due a catch-up (or null with no cadence). */
export function dueOn(p: Pick<Person, "cadenceDays" | "createdAt">, last: Day | null, created: Day): Day | null {
  if (!p.cadenceDays) return null;
  return addDays(last ?? created, p.cadenceDays);
}

/** Phone number digits for wa.me links (keeps a leading country code, drops spaces and symbols). */
export function whatsappLink(n: string): string {
  return `https://wa.me/${n.replace(/[^\d]/g, "")}`;
}
