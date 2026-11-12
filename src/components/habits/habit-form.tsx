"use client";

import { useState } from "react";
import { AreaPicker, GoalPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useActions } from "@/features/actions";
import type { HabitDoc } from "@/features/data";
import type { Schedule } from "@/features/habits/model";
import { cn } from "@/lib/cn";

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** PRD HAB-1: create or edit a habit. */
export function HabitForm({ habit, open, onClose }: { habit?: HabitDoc | null; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={habit ? "Edit habit" : "New habit"}>
      {open ? <HabitFormBody key={habit?.id ?? "new"} habit={habit} onClose={onClose} /> : null}
    </Modal>
  );
}

function HabitFormBody({ habit, onClose }: { habit?: HabitDoc | null; onClose: () => void }) {
  const actions = useActions();
  const [name, setName] = useState(habit?.name ?? "");
  const [kind, setKind] = useState<Schedule["type"]>(habit?.schedule.type ?? "daily");
  const [days, setDays] = useState<number[]>(habit?.schedule.type === "days" ? habit.schedule.days : [1, 2, 3, 4, 5]);
  const [times, setTimes] = useState(habit?.schedule.type === "weekly" ? habit.schedule.timesPerWeek : 3);
  const [counted, setCounted] = useState(habit?.targetType === "count");
  const [target, setTarget] = useState(habit?.targetCount ?? 10);
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [reminder, setReminder] = useState(habit?.reminderTime ?? "");
  const [areaId, setAreaId] = useState<string | null>(habit?.areaId ?? null);
  const [goalId, setGoalId] = useState<string | null>(habit?.goalId ?? null);

  const schedule: Schedule =
    kind === "daily"
      ? { type: "daily" }
      : kind === "days"
        ? { type: "days", days: [...days].sort() }
        : { type: "weekly", timesPerWeek: times };
  const valid = name.trim() && (kind !== "days" || days.length > 0) && (!counted || target >= 1);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const fields = {
      name: name.trim(),
      schedule,
      targetType: counted ? ("count" as const) : ("boolean" as const),
      targetCount: counted ? Math.max(1, Math.round(target)) : 1,
      unit: counted && unit.trim() ? unit.trim() : null,
      reminderTime: reminder || null,
      areaId,
      goalId,
    };
    onClose();
    if (habit) await actions.updateHabit(habit.id, fields);
    else await actions.createHabit(fields);
  }

  const chip = (on: boolean) =>
    cn(
      "h-9 rounded-full px-3.5 text-callout font-medium",
      on ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
    );

  return (
    <form onSubmit={save} className="flex flex-col gap-4 pb-2">
      <Field label="Habit">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Read, Stretch, Apply to jobs"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-footnote font-medium text-label-secondary">How often</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How often">
          {(
            [
              ["daily", "Every day"],
              ["days", "On certain days"],
              ["weekly", "Times a week"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={chip(kind === k)}
            >
              {label}
            </button>
          ))}
        </div>
        {kind === "days" ? (
          <div className="flex gap-1.5" role="group" aria-label="Days">
            {WD.map((d, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={days.includes(i)}
                aria-label={WD_LONG[i]}
                onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}
                className={cn(
                  "size-10 rounded-full text-callout font-semibold",
                  days.includes(i) ? "bg-accent text-on-accent" : "bg-fill",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        ) : null}
        {kind === "weekly" ? (
          <label className="flex items-center gap-2 text-callout">
            <input
              type="number"
              min={1}
              max={7}
              value={times}
              onChange={(e) => setTimes(Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
              aria-label="Times a week"
              className="h-control w-20 rounded-md bg-surface-sunken px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            times a week, any days
          </label>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-footnote font-medium text-label-secondary">Goal for the day</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Goal for the day">
          <button
            type="button"
            role="radio"
            aria-checked={!counted}
            onClick={() => setCounted(false)}
            className={chip(!counted)}
          >
            Just do it
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={counted}
            onClick={() => setCounted(true)}
            className={chip(counted)}
          >
            A number
          </button>
        </div>
        {counted ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              aria-label="Target"
              className="h-control w-24 rounded-md bg-surface-sunken px-3 text-body outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              aria-label="Unit"
              placeholder="pages, minutes…"
              className="h-control min-w-0 flex-1 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[96px_1fr] items-center gap-x-2 gap-y-2 text-callout">
        <span className="text-footnote text-label-secondary">Reminder</span>
        <input
          type="time"
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
          aria-label="Reminder time"
          className="h-9 w-32 rounded-md bg-surface-sunken px-2 text-callout outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <span className="text-footnote text-label-secondary">Area</span>
        <div>
          <AreaPicker value={areaId} onChange={setAreaId} />
        </div>
        <span className="text-footnote text-label-secondary">Goal</span>
        <div>
          <GoalPicker value={goalId} areaId={areaId} onChange={setGoalId} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid}>
          {habit ? "Save" : "Add habit"}
        </Button>
      </div>
    </form>
  );
}
