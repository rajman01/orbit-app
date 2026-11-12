"use client";

import { CalendarDays, Circle, Gauge, Target, X } from "lucide-react";
import { useState } from "react";
import { AreaIcon } from "@/components/areas/area-icon";
import { ChipButton, Picker, Popover, type PickerOption } from "@/components/ui/picker";
import { type Area, useAreas, useGoals } from "@/features/data";
import { PRIORITY_META, STATUS_META, type Priority, type TaskStatus } from "@/features/tasks/model";
import { addDays, dayLabel, weekday, type Day } from "@/lib/dates";
import { EFFORTS, PRIORITIES, TASK_STATUSES } from "@/lib/sync/entities";
import { PriorityIcon, StatusIcon } from "./icons";

export const STATUS_OPTIONS: PickerOption<TaskStatus>[] = TASK_STATUSES.map((s, i) => ({
  value: s,
  label: STATUS_META[s].label,
  icon: <StatusIcon status={s} />,
  hint: String(i + 1),
}));

export const PRIORITY_OPTIONS: PickerOption<Priority>[] = PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_META[p].label,
  icon: <PriorityIcon priority={p} />,
  hint: PRIORITY_META[p].shortcut,
}));

type Effort = (typeof EFFORTS)[number] | null;
export const EFFORT_OPTIONS: PickerOption<Effort>[] = [
  { value: null, label: "No estimate" },
  ...EFFORTS.map((e) => ({ value: e, label: `${e} point${e === 1 ? "" : "s"}`, hint: String(e) })),
];

export function StatusPicker({
  value,
  onChange,
  trigger,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
  trigger?: React.ReactNode;
}) {
  return (
    <Picker
      label="Status"
      value={value}
      options={STATUS_OPTIONS}
      onChange={onChange}
      trigger={
        trigger ?? (
          <ChipButton aria-label={`Status: ${STATUS_META[value].label}`}>
            <StatusIcon status={value} />
            {STATUS_META[value].label}
          </ChipButton>
        )
      }
    />
  );
}

export function PriorityPicker({
  value,
  onChange,
  trigger,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
  trigger?: React.ReactNode;
}) {
  return (
    <Picker
      label="Priority"
      value={value}
      options={PRIORITY_OPTIONS}
      onChange={onChange}
      trigger={
        trigger ?? (
          <ChipButton aria-label={`Priority: ${PRIORITY_META[value].label}`}>
            <PriorityIcon priority={value} />
            {PRIORITY_META[value].label}
          </ChipButton>
        )
      }
    />
  );
}

export function EffortPicker({ value, onChange }: { value: Effort; onChange: (e: Effort) => void }) {
  return (
    <Picker
      label="Effort"
      value={value}
      options={EFFORT_OPTIONS}
      onChange={onChange}
      trigger={
        <ChipButton aria-label="Effort">
          <Gauge className="size-4 text-label-secondary" strokeWidth={1.75} />
          {value ? `${value} pt${value === 1 ? "" : "s"}` : <span className="text-label-tertiary">Estimate</span>}
        </ChipButton>
      }
    />
  );
}

export function AreaPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const areas = useAreas() ?? [];
  const current = areas.find((a) => a.id === value);
  return (
    <Picker
      label="Area"
      value={value}
      options={[
        { value: null, label: "No area", icon: <Circle className="size-4 text-label-tertiary" /> },
        ...areas.map(areaOption),
      ]}
      onChange={onChange}
      trigger={
        <ChipButton aria-label="Area">
          <AreaIcon icon={current?.icon} color={current?.color} />
          {current ? current.name : <span className="text-label-tertiary">Area</span>}
        </ChipButton>
      }
    />
  );
}

const areaOption = (a: Area): PickerOption<string | null> => ({
  value: a.id,
  label: a.name,
  icon: <AreaIcon icon={a.icon} color={a.color} />,
});

export function GoalPicker({
  value,
  onChange,
  areaId,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  areaId?: string | null;
}) {
  const goals = (useGoals() ?? []).filter((g) => g.status === "active" || g.status === "planned" || g.id === value);
  const sorted = areaId ? [...goals].sort((a, b) => Number(b.areaId === areaId) - Number(a.areaId === areaId)) : goals;
  const current = goals.find((g) => g.id === value);
  return (
    <Picker
      label="Goal"
      value={value}
      options={[
        { value: null, label: "No goal" },
        ...sorted.map((g) => ({
          value: g.id,
          label: g.title,
          icon: <Target className="size-4 text-label-secondary" strokeWidth={1.75} />,
        })),
      ]}
      onChange={onChange}
      trigger={
        <ChipButton aria-label="Goal">
          <Target className="size-4 text-label-secondary" strokeWidth={1.75} />
          <span className="truncate">
            {current ? current.title : <span className="text-label-tertiary">Goal</span>}
          </span>
        </ChipButton>
      }
    />
  );
}

/** Date picker with quick choices and a native date field (works offline, accessible). */
export function DatePicker({
  value,
  onChange,
  todayDay,
  label,
  placeholder,
  overdue,
}: {
  value: Day | null;
  onChange: (d: Day | null) => void;
  todayDay: Day;
  label: string;
  placeholder: string;
  overdue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const nextMonday = addDays(todayDay, (8 - weekday(todayDay)) % 7 || 7);
  const choose = (d: Day | null) => {
    onChange(d);
    setOpen(false);
  };
  const quick: [string, Day][] = [
    ["Today", todayDay],
    ["Tomorrow", addDays(todayDay, 1)],
    ["Next week", nextMonday],
  ];
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <ChipButton aria-label={label}>
          <CalendarDays className="size-4 text-label-secondary" strokeWidth={1.75} />
          {value ? (
            <span className={overdue ? "text-danger-text" : undefined}>{dayLabel(value, todayDay)}</span>
          ) : (
            <span className="text-label-tertiary">{placeholder}</span>
          )}
        </ChipButton>
      }
    >
      <p className="px-2 pt-1 pb-1.5 text-micro text-label-tertiary uppercase">{label}</p>
      {quick.map(([name, d]) => (
        <button
          key={name}
          type="button"
          onClick={() => choose(d)}
          className="flex h-11 w-full items-center justify-between rounded-md px-2 text-body hover:bg-fill lg:h-8"
        >
          {name}
          <span className="text-footnote text-label-tertiary">
            {dayLabel(d, todayDay) === name ? "" : dayLabel(d, todayDay)}
          </span>
        </button>
      ))}
      <label className="mt-1 flex items-center gap-2 px-2 py-1.5">
        <span className="text-footnote text-label-secondary">Pick</span>
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => e.target.value && choose(e.target.value)}
          className="h-9 flex-1 rounded-md bg-surface-sunken px-2 text-callout text-label outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      {value ? (
        <button
          type="button"
          onClick={() => choose(null)}
          className="mt-1 flex h-11 w-full items-center gap-2 rounded-md px-2 text-body text-label-secondary hover:bg-fill lg:h-8"
        >
          <X className="size-4" /> Clear
        </button>
      ) : null}
    </Popover>
  );
}
