"use client";

import { AlertTriangle, CalendarDays } from "lucide-react";
import Link from "next/link";
import { AreaIcon } from "@/components/areas/area-icon";
import { AiMadeBadge } from "@/components/coach/ai-badge";
import { Pill } from "@/components/ui/pill";
import { ProgressRing } from "@/components/ui/progress-ring";
import type { Area } from "@/features/data";
import { areaColorVar } from "@/features/areas/model";
import { GOAL_STATUS_META, HEALTH_META, type Goal, type GoalHealth } from "@/features/goals/model";
import type { Task } from "@/features/tasks/model";
import { dayLabel } from "@/lib/dates";

/** DESIGN.md §11.12 */
export function GoalCard({
  goal,
  area,
  progress,
  health,
  nextTask,
  needsNextStep,
  todayDay,
}: {
  goal: Goal;
  area?: Area;
  progress: number;
  health: GoalHealth | null;
  nextTask?: Task;
  needsNextStep: boolean;
  todayDay: string;
}) {
  const closed = goal.status === "completed" || goal.status === "dropped";
  return (
    <Link
      href={`/goal?id=${goal.id}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-separator bg-surface p-4 pl-5 shadow-1 transition-colors hover:bg-fill/40 active:scale-[0.99]"
      style={{ borderStyle: needsNextStep ? "dashed" : undefined }}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: areaColorVar(area?.color) }}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {area ? (
            <p className="mb-0.5 flex items-center gap-1.5 text-caption text-label-secondary">
              <AreaIcon icon={area.icon} color={area.color} className="size-3" /> {area.name}
            </p>
          ) : null}
          <h3 className="text-title3">
            {goal.title} <AiMadeBadge entity="goals" id={goal.id} />
          </h3>
        </div>
        <ProgressRing
          value={progress}
          size={36}
          stroke={4}
          color={areaColorVar(area?.color)}
          label={`${Math.round(progress * 100)}% complete`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-footnote text-label-secondary">
        {closed ? (
          <Pill>{GOAL_STATUS_META[goal.status].label}</Pill>
        ) : health ? (
          <Pill tone={HEALTH_META[health].tone}>{HEALTH_META[health].label}</Pill>
        ) : null}
        {goal.status === "paused" || goal.status === "planned" ? (
          <Pill>{GOAL_STATUS_META[goal.status].label}</Pill>
        ) : null}
        <span className="tabular">{Math.round(progress * 100)}%</span>
        {goal.targetDate ? (
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" strokeWidth={1.75} /> {dayLabel(goal.targetDate, todayDay)}
          </span>
        ) : null}
      </div>
      {needsNextStep ? (
        <p className="flex items-center gap-1.5 text-footnote font-medium text-warning-text">
          <AlertTriangle className="size-3.5" /> Add a next step
        </p>
      ) : nextTask ? (
        <p className="truncate text-footnote text-label-secondary">Next: {nextTask.title}</p>
      ) : null}
    </Link>
  );
}
