import type { EntityFields } from "@/lib/sync/entities";
import { deviceTimezone } from "@/lib/dates";

export type Settings = EntityFields<"settings">;

/** One settings document per user, with an id derived from the user id so devices never create two. */
export function settingsId(userId: string): string {
  return `s${userId}`.slice(0, 40);
}

export function defaultSettings(): Settings {
  return {
    timezone: deviceTimezone(),
    weekStartDay: 0,
    cycleLengthDays: 14,
    dailyCapacityPts: 8,
    cycleCapacityPts: 30,
    workingHours: { start: "09:00", end: "17:00" },
    strictness: "firm",
    onboardingCompletedAt: null,
  };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
