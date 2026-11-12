import { daysBetween, type Day } from "@/lib/dates";
import type { EntityFields, SyncedDoc } from "@/lib/sync/entities";

export type XpEvent = SyncedDoc<"xpEvents">;
export type XpFields = EntityFields<"xpEvents">;
export type XpSource = XpFields["source"];

const CODE: Record<XpSource, string> = {
  task: "t",
  focus: "f",
  ritual: "r",
  habit: "h",
  milestone: "m",
  goal: "g",
  checkin: "k",
  win: "w",
  penalty: "p",
};

/** One XP entry per source, the same on every device, so nothing is awarded twice (PRD §9.1). */
export function xpEventId(source: XpSource, sourceId: string): string {
  return `x${CODE[source]}${sourceId}`.replace(/[^0-9A-Za-z]/g, "").slice(0, 40);
}

// ---------------------------------------------------------------- awards (PRD §9.1)

/** Tasks created and completed within this window earn nothing (anti-gaming), unless they repeat. */
export const INSTANT_TASK_MS = 2 * 60_000;

export function taskXp(opts: {
  effort: number | null;
  mustDo: boolean;
  wasStale: boolean;
  createdAt: number;
  completedAt: number;
  recurring: boolean;
}): { amount: number; reason: string } {
  if (!opts.recurring && opts.completedAt - opts.createdAt < INSTANT_TASK_MS) {
    return { amount: 0, reason: "Created and done within 2 minutes" };
  }
  const base = 10 * (opts.effort ?? 1);
  let multiplier = 1;
  const parts = [`${opts.effort ?? 1} pt task`];
  if (opts.mustDo) {
    multiplier += 0.5;
    parts.push("Must-do +50%");
  }
  if (opts.wasStale) {
    multiplier += 1;
    parts.push("beat procrastination +100%");
  }
  return { amount: Math.round(base * multiplier), reason: parts.join(" · ") };
}

/**
 * Daily XP from tasks is soft-capped at 3× the recent daily average: past the cap, a task earns
 * half. The cap never drops below 150 XP, so a slow fortnight doesn't punish a good day.
 */
export function softCap(amount: number, earnedToday: number, recentDailyAverage: number): number {
  const cap = Math.max(150, 3 * recentDailyAverage);
  if (earnedToday >= cap) return Math.round(amount / 2);
  if (earnedToday + amount <= cap) return amount;
  const within = cap - earnedToday;
  return Math.round(within + (amount - within) / 2);
}

/** 15 XP per full 25 minutes of focus. */
export function focusXp(actualMinutes: number): number {
  return Math.floor(actualMinutes / 25) * 15;
}

export const RITUAL_XP = { daily_plan: 20, daily_shutdown: 20, cycle_review: 100 } as const;

/** 5 XP, with a streak multiplier rising to 2× at 30 days. */
export function habitXp(streakDays: number): number {
  return Math.round(5 * (1 + Math.min(Math.max(streakDays, 0), 30) / 30));
}

export const MILESTONE_XP = 100;
export const CHECKIN_XP = 10;
export const WIN_XP = 15;
export const STALE_PENALTY = 5;

/** 500 XP, scaled by how long the goal ran: a 3-month goal earns 500; shorter less, longer more (0.25× – 2×). */
export function goalXp(startDay: Day, endDay: Day): number {
  const days = Math.max(1, daysBetween(startDay, endDay));
  return Math.round(500 * Math.min(2, Math.max(0.25, days / 90)));
}

// ---------------------------------------------------------------- levels (PRD §9.2)

/** XP needed to go from level n to n + 1: 100 × n^1.5. */
export function xpForLevel(n: number): number {
  return Math.round(100 * n ** 1.5);
}

export const LEVEL_TITLES = [
  "Spark",
  "Drift",
  "Orbit",
  "Ascent",
  "Momentum",
  "Gravity",
  "Constellation",
  "Nebula",
  "Pulsar",
  "Quasar",
  "Supernova",
  "Galaxy",
  "Cosmos",
];

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1];
}

export interface LevelInfo {
  level: number;
  title: string;
  total: number;
  /** XP into the current level, and needed for the next. */
  into: number;
  needed: number;
  /** Total XP at which the current level starts (penalties never go below this). */
  floor: number;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const total = Math.max(0, totalXp);
  let level = 1;
  let floor = 0;
  while (total >= floor + xpForLevel(level)) {
    floor += xpForLevel(level);
    level++;
  }
  return { level, title: levelTitle(level), total, into: total - floor, needed: xpForLevel(level), floor };
}

export function totalXp(events: Pick<XpEvent, "amount" | "deletedAt">[]): number {
  return events.reduce((s, e) => (e.deletedAt == null ? s + e.amount : s), 0);
}

/** XP per area, for area levels. */
export function xpByArea(events: Pick<XpEvent, "amount" | "areaId" | "deletedAt">[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) {
    if (e.deletedAt != null || !e.areaId) continue;
    map.set(e.areaId, (map.get(e.areaId) ?? 0) + e.amount);
  }
  return map;
}
