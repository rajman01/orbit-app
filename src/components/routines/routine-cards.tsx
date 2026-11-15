"use client";

import { ListChecks, Pencil, Play, Plus } from "lucide-react";
import { useState } from "react";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { useRoutineRuns, useRoutines, type RoutineDoc } from "@/features/data";
import { routineDueOn, routineMinutes, runProgress, ROUTINE_KIND_LABEL } from "@/features/routines/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { RoutineForm } from "./routine-form";
import { RoutineRunner } from "./routine-runner";

function RoutineRow({
  routine,
  onRun,
  onEdit,
  due,
}: {
  routine: RoutineDoc;
  onRun: () => void;
  onEdit?: () => void;
  due: boolean;
}) {
  const today = useToday();
  const runs = useRoutineRuns(today);
  const p = runProgress(routine, runs?.get(routine.id));
  const mins = routineMinutes(routine);
  return (
    <li className="flex min-h-row items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fill">
      <ListChecks className="size-4 shrink-0 text-label-secondary" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-body", p.complete && "text-label-tertiary")}>{routine.name}</span>
        <span className="block truncate text-footnote text-label-secondary">
          {ROUTINE_KIND_LABEL[routine.kind]} · {routine.steps.length} step{routine.steps.length === 1 ? "" : "s"}
          {mins ? ` · ${mins} min` : ""}
          {p.complete ? " · done today" : p.done ? ` · ${p.done} of ${p.total} done` : due ? "" : " · not today"}
          {routine.reminderTime ? ` · ${routine.reminderTime}` : ""}
        </span>
      </span>
      {onEdit ? (
        <IconButton label={`Edit ${routine.name}`} icon={<Pencil className="size-4" />} onClick={onEdit} />
      ) : null}
      {!p.complete ? (
        <button
          type="button"
          onClick={onRun}
          aria-label={`${p.done ? "Continue" : "Start"} ${routine.name}`}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text hover:brightness-95"
        >
          <Play className="size-3.5" fill="currentColor" /> {p.done ? "Continue" : "Start"}
        </button>
      ) : null}
    </li>
  );
}

/** Today: routines due today and not finished. */
export function TodayRoutines() {
  const today = useToday();
  const routines = useRoutines() ?? [];
  const runs = useRoutineRuns(today);
  const [running, setRunning] = useState<RoutineDoc | null>(null);
  const due = routines.filter((r) => routineDueOn(r, today) && !runProgress(r, runs?.get(r.id)).complete);
  if (!due.length && !running) return null;
  return (
    <section aria-label="Routines" className="mb-2">
      <SectionLabel count={due.length}>Routines</SectionLabel>
      <ul className="flex flex-col">
        {due.map((r) => (
          <RoutineRow key={r.id} routine={r} due onRun={() => setRunning(r)} />
        ))}
      </ul>
      {running ? <RoutineRunner routine={running} onClose={() => setRunning(null)} /> : null}
    </section>
  );
}

/** The Habits page: every routine, to run or edit, and "New routine". */
export function RoutinesSection() {
  const today = useToday();
  const routines = useRoutines();
  const [running, setRunning] = useState<RoutineDoc | null>(null);
  const [editing, setEditing] = useState<RoutineDoc | "new" | null>(null);
  return (
    <section aria-label="Routines">
      <div className="mt-6 mb-1 flex items-center justify-between gap-2 px-1">
        <h2 className="text-micro text-label-secondary uppercase">Routines</h2>
        <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New routine
        </Button>
      </div>
      {routines && !routines.length ? (
        <p className="px-2 text-callout text-label-secondary">
          A routine is a short checklist you run in order, like a morning start or an evening wind-down. Steps can tick
          a habit as you go.
        </p>
      ) : null}
      <ul className="flex flex-col">
        {(routines ?? []).map((r) => (
          <RoutineRow
            key={r.id}
            routine={r}
            due={routineDueOn(r, today)}
            onRun={() => setRunning(r)}
            onEdit={() => setEditing(r)}
          />
        ))}
      </ul>
      {running ? <RoutineRunner routine={running} onClose={() => setRunning(null)} /> : null}
      {editing ? (
        <RoutineForm
          key={editing === "new" ? "new" : editing.id}
          open
          routine={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}
