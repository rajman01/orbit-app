"use client";

import { useSyncExternalStore } from "react";
import { today } from "@/lib/dates";
import { useSettings } from "./data";

// Re-render subscribers when the minute changes, so "today" rolls over at midnight.
const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};

export function useToday(): string {
  const { timezone } = useSettings();
  return useSyncExternalStore(
    subscribe,
    () => today(timezone),
    () => today(timezone),
  );
}
