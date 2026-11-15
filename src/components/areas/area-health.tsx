"use client";

import { useMemo, useState } from "react";
import { useAllTasks, useFocusSessions, useGoals, useKeyResults, useSettings } from "@/features/data";
import { areaHealth, withSuggestedHealth, type AreaHealth, type HealthLevel } from "@/features/insights/model";
import { lastTouched } from "@/features/today/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";

/** AREA-3: every area's health, worked out from goals and tasks on the device. */
export function useAreaHealths(areaIds: string[]): Map<string, AreaHealth> | undefined {
  const tasks = useAllTasks();
  const goals = useGoals();
  const sessions = useFocusSessions();
  const krs = useKeyResults();
  const settings = useSettings();
  const today = useToday();
  const [now] = useState(() => Date.now());
  const key = areaIds.join();
  return useMemo(() => {
    if (!tasks || !goals || !sessions || !krs) return undefined;
    const touched = lastTouched(tasks, sessions);
    // A goal without a health set uses the suggested one, as goal cards do.
    const withHealth = withSuggestedHealth(goals, krs, tasks, today, settings.timezone);
    const ids = key ? key.split(",") : [];
    return new Map(
      ids.map((id) => [id, areaHealth(id, { goals: withHealth, tasks, today, now, tz: settings.timezone, touched })]),
    );
  }, [tasks, goals, sessions, krs, settings.timezone, today, now, key]);
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  green: "Healthy",
  amber: "Needs attention",
  red: "Neglected",
};

const DOT: Record<HealthLevel, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-danger",
};

/** A coloured dot; its label (and tooltip) gives the reasons. */
export function HealthDot({ health, className }: { health: AreaHealth | undefined; className?: string }) {
  if (!health) return null;
  const text = `${HEALTH_LABEL[health.level]}${health.reasons.length ? `: ${health.reasons.join("; ")}` : ""}`;
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      className={cn("inline-block size-2.5 shrink-0 rounded-full", DOT[health.level], className)}
    />
  );
}

/** The level as a small pill with the first reason, for an area's page. */
export function HealthPill({ health }: { health: AreaHealth | undefined }) {
  if (!health) return null;
  return (
    <span
      title={health.reasons.join("; ")}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-footnote font-medium"
    >
      <HealthDot health={health} className="size-2" />
      <span className="truncate">
        {HEALTH_LABEL[health.level]}
        {health.reasons[0] ? <span className="text-label-secondary"> · {health.reasons[0]}</span> : null}
      </span>
    </span>
  );
}
