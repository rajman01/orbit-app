"use client";

import { useSyncExternalStore } from "react";
import { today } from "@/lib/dates";
import { useSettings } from "./data";

/**
 * Re-renders subscribers when the minute changes, so "today" rolls over at midnight. Timers
 * stop while a laptop sleeps or a phone has the app in the background, so the clock is also
 * checked the moment the app is back in view.
 */
export const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  window.addEventListener("focus", cb);
  document.addEventListener("visibilitychange", cb);
  return () => {
    clearInterval(t);
    window.removeEventListener("focus", cb);
    document.removeEventListener("visibilitychange", cb);
  };
};

export function useToday(): string {
  const { timezone } = useSettings();
  return useSyncExternalStore(
    subscribeMinute,
    () => today(timezone),
    () => today(timezone),
  );
}
