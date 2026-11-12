"use client";

import { Flame, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { AreaDot } from "@/components/areas/area-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover } from "@/components/ui/picker";
import { useActions } from "@/features/actions";
import type { Area, HabitDoc, HabitLogDoc } from "@/features/data";
import { scheduleLabel, targetLabel, type HabitStatus } from "@/features/habits/model";
import { cn } from "@/lib/cn";

/** A habit with its streak and a check-in (PRD HAB-2): tap to complete, or set a count. */
export function HabitRow({
  habit,
  status,
  log,
  today,
  area,
  onEdit,
}: {
  habit: HabitDoc;
  status: HabitStatus;
  log?: HabitLogDoc;
  today: string;
  area?: Area;
  onEdit?: () => void;
}) {
  const actions = useActions();
  const target = targetLabel(habit);
  const value = log?.value ?? 0;
  const streakText =
    status.streak > 0
      ? `${status.streak} ${status.unit === "week" ? (status.streak === 1 ? "week" : "weeks") : status.streak === 1 ? "day" : "days"}`
      : null;

  return (
    <div className="group flex min-h-row items-center gap-1 rounded-md pr-2 pl-1 hover:bg-fill">
      {habit.targetType === "boolean" ? (
        <Checkbox
          checked={status.doneToday}
          onChange={(d) => void actions.logHabit(habit, today, d ? 1 : 0)}
          label={`Check in ${habit.name}`}
          color="var(--accent)"
        />
      ) : (
        <CountCheck habit={habit} value={value} today={today} done={status.doneToday} />
      )}
      <button type="button" onClick={onEdit} disabled={!onEdit} className="min-w-0 flex-1 py-1.5 text-left">
        <p className={cn("truncate", status.doneToday && "text-label-secondary")}>{habit.name}</p>
        <p className="truncate text-footnote text-label-secondary">
          {scheduleLabel(habit.schedule)}
          {target ? ` · ${target}` : ""}
          {status.thisWeek ? ` · ${status.thisWeek.done}/${status.thisWeek.target} this week` : ""}
        </p>
      </button>
      {streakText ? (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-footnote font-semibold tabular",
            status.atRisk ? "text-warning-text" : "text-label-secondary",
          )}
          title={status.atRisk ? "One miss: don't miss twice" : "Streak"}
        >
          <Flame className={cn("size-3.5", !status.atRisk && status.streak > 0 && "text-warning")} aria-hidden />
          {streakText}
          {status.atRisk ? <span className="font-medium"> · at risk</span> : null}
        </span>
      ) : null}
      {area ? <AreaDot color={area.color} className="ml-2" /> : null}
    </div>
  );
}

function CountCheck({ habit, value, today, done }: { habit: HabitDoc; value: number; today: string; done: boolean }) {
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const pct = Math.min(1, value / habit.targetCount);
  const set = (v: number) => void actions.logHabit(habit, today, Math.max(0, v));
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label={`Log ${habit.name}: ${value} of ${habit.targetCount}`}
          className="relative grid size-11 shrink-0 place-items-center lg:size-8"
        >
          <svg viewBox="0 0 24 24" className="size-[26px] -rotate-90 lg:size-[22px]" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--fill-strong)" strokeWidth="2.5" />
            <circle
              cx="12"
              cy="12"
              r="10"
              fill={done ? "var(--accent)" : "none"}
              stroke="var(--accent)"
              strokeWidth="2.5"
              pathLength={1}
              strokeDasharray={`${pct} 1`}
              strokeLinecap="round"
            />
          </svg>
          {!done ? <span className="absolute text-[9px] font-bold tabular">{value || ""}</span> : null}
        </button>
      }
    >
      <p className="px-2 pt-1 pb-2 text-micro text-label-tertiary uppercase">{habit.name}</p>
      <div className="flex items-center gap-2 px-2 pb-2">
        <button
          type="button"
          aria-label="Less"
          onClick={() => set(value - 1)}
          className="grid size-9 place-items-center rounded-full bg-fill"
        >
          <Minus className="size-4" />
        </button>
        <input
          type="number"
          min={0}
          value={value}
          aria-label={`${habit.name} today`}
          onChange={(e) => set(Number(e.target.value) || 0)}
          className="h-9 w-20 rounded-md bg-surface-sunken text-center text-body tabular outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="button"
          aria-label="More"
          onClick={() => set(value + 1)}
          className="grid size-9 place-items-center rounded-full bg-fill"
        >
          <Plus className="size-4" />
        </button>
        <span className="text-footnote text-label-secondary">
          / {habit.targetCount}
          {habit.unit ? ` ${habit.unit}` : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          set(habit.targetCount);
          setOpen(false);
        }}
        className="h-10 w-full rounded-md text-callout font-semibold text-accent-text hover:bg-accent-fill"
      >
        Done for today
      </button>
    </Popover>
  );
}
