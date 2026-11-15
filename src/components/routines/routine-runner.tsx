"use client";

import { Check, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useActions } from "@/features/actions";
import { useRoutineRuns, type RoutineDoc } from "@/features/data";
import { runProgress, ROUTINE_XP, type RoutineStep } from "@/features/routines/model";
import { useToday } from "@/features/use-today";
import { formatClock } from "@/features/focus/model";
import { cn } from "@/lib/cn";

/**
 * HAB-5: run a routine one step at a time. A step with a length has a timer; Done moves on; a
 * step tied to a habit ticks the habit. Progress is saved as you go, so it can be left and resumed.
 */
export function RoutineRunner({ routine, onClose }: { routine: RoutineDoc; onClose: () => void }) {
  const actions = useActions();
  const today = useToday();
  const runs = useRoutineRuns(today);
  const run = runs?.get(routine.id);
  const p = runProgress(routine, run);
  const done = new Set(run?.doneStepIds ?? []);
  const skipped = new Set(run?.skippedStepIds ?? []);

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={routine.name} width={480}>
      <div className="flex flex-col gap-5">
        <div
          role="progressbar"
          aria-label="Steps done"
          aria-valuemin={0}
          aria-valuemax={p.total}
          aria-valuenow={p.done}
          className="flex gap-1"
        >
          {routine.steps.map((s) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                done.has(s.id) ? "bg-accent" : skipped.has(s.id) ? "bg-label-tertiary" : "bg-fill",
              )}
            />
          ))}
        </div>

        {p.complete ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-accent text-on-accent">
              <Check className="size-7" strokeWidth={2.5} />
            </span>
            <p className="text-title3">Routine done</p>
            <p className="text-callout text-label-secondary">
              {p.done} of {p.total} steps · +{ROUTINE_XP} XP
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : p.next ? (
          <CurrentStep
            key={p.next.id}
            step={p.next}
            index={routine.steps.indexOf(p.next)}
            total={p.total}
            onDone={() => void actions.finishRoutineStep(routine, today, p.next!.id, "done")}
            onSkip={() => void actions.finishRoutineStep(routine, today, p.next!.id, "skipped")}
          />
        ) : null}

        <ol aria-label="All steps" className="flex flex-col">
          {routine.steps.map((s, i) => {
            const state = done.has(s.id) ? "done" : skipped.has(s.id) ? "skipped" : "todo";
            return (
              <li key={s.id} className="flex min-h-10 items-center gap-2 text-callout">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]",
                    state === "done" ? "border-accent bg-accent text-on-accent" : "border-label-tertiary",
                  )}
                >
                  {state === "done" ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    state !== "todo" && "text-label-tertiary",
                    state === "skipped" && "line-through",
                  )}
                >
                  {s.text}
                  {s.minutes ? <span className="text-label-tertiary"> · {s.minutes} min</span> : null}
                </span>
                {state !== "todo" ? (
                  <button
                    type="button"
                    onClick={() => void actions.undoRoutineStep(routine, today, s.id)}
                    aria-label={`Undo step ${i + 1}`}
                    className="grid size-8 place-items-center rounded-full text-label-tertiary hover:bg-fill"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </Modal>
  );
}

function CurrentStep({
  step,
  index,
  total,
  onDone,
  onSkip,
}: {
  step: RoutineStep;
  index: number;
  total: number;
  onDone: () => void;
  onSkip: () => void;
}) {
  const ms = (step.minutes ?? 0) * 60_000;
  const [left, setLeft] = useState(ms);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const end = Date.now() + left;
    const t = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l === 0) setRunning(false);
    }, 250);
    return () => clearInterval(t);
    // `left` is read once when the timer starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <section
      aria-label="Current step"
      className="flex flex-col items-center gap-4 rounded-xl bg-surface-sunken p-5 text-center"
    >
      <p className="text-footnote font-medium text-label-secondary">
        Step {index + 1} of {total}
      </p>
      <p className="text-title2">{step.text}</p>
      {ms ? (
        <div className="flex items-center gap-3">
          <span className={cn("text-title1 tabular", left === 0 && "text-accent-text")} aria-live="polite">
            {left === 0 ? "Time" : formatClock(left)}
          </span>
          {left > 0 ? (
            <Button
              variant="secondary"
              icon={running ? <Pause className="size-4" /> : <Play className="size-4" />}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? "Pause" : "Start timer"}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button variant="ghost" icon={<SkipForward className="size-4" />} onClick={onSkip}>
          Skip
        </Button>
        <Button icon={<Check className="size-4" />} onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}
