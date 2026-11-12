"use client";

import { ArrowLeft } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useFocus } from "@/components/focus/focus-mode";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useSettings } from "@/features/data";
import type { Task } from "@/features/tasks/model";
import { isSkip, SKIP_REASONS, type SkipReason } from "@/features/today/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayLabel, weekday, type Day } from "@/lib/dates";

interface SkipContext {
  /** Opens the skip flow for a task; `to` preselects where it's going (e.g. from a date picker). */
  open: (task: Task, opts?: { to?: Day | null }) => void;
}

const Ctx = createContext<SkipContext | null>(null);

export function useSkipFlow(): SkipContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSkipFlow must be used inside <SkipFlowProvider>");
  return c;
}

/** PRD §8.2 — moving a planned task asks why (one tap), then suggests what to do about it. */
export function SkipFlowProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ task: Task; to?: Day | null; key: number } | null>(null);
  const open = useCallback((task: Task, opts: { to?: Day | null } = {}) => {
    setTarget({ task, to: opts.to, key: Date.now() });
  }, []);
  const value = useMemo(() => ({ open }), [open]);
  const close = useCallback(() => setTarget(null), []);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        open={target != null}
        onOpenChange={(o) => !o && close()}
        title={target ? `Move “${target.task.title}”` : "Move task"}
      >
        {target ? <SkipFlow key={target.key} task={target.task} initialTo={target.to} onClose={close} /> : null}
      </Modal>
    </Ctx.Provider>
  );
}

const SOMEDAY = "someday";

function SkipFlow({ task, initialTo, onClose }: { task: Task; initialTo?: Day | null; onClose: () => void }) {
  const actions = useActions();
  const focus = useFocus();
  const toast = useToast();
  const settings = useSettings();
  const todayDay = useToday();
  const planned = isSkip(task, todayDay, null);
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [step, setStep] = useState<"reason" | "move">(planned ? "reason" : "move");
  const [to, setTo] = useState<Day | typeof SOMEDAY>(
    initialTo === undefined ? addDays(todayDay, 1) : (initialTo ?? SOMEDAY),
  );
  const [reasonText, setReasonText] = useState("");
  const [nextStep, setNextStep] = useState(task.nextStep ?? "");
  const [steps, setSteps] = useState(["", "", ""]);
  const reasonRequired = settings.strictness !== "gentle";

  const nextMonday = addDays(todayDay, (8 - weekday(todayDay)) % 7 || 7);
  const choices: [string, Day | typeof SOMEDAY][] = [
    ["Tomorrow", addDays(todayDay, 1)],
    ["In 2 days", addDays(todayDay, 2)],
    ["Next week", nextMonday],
    ["No date", SOMEDAY],
  ];
  const toDay = to === SOMEDAY ? null : to;

  async function move() {
    if (reason === "unclear" && nextStep.trim() && nextStep.trim() !== task.nextStep) {
      await actions.updateTask(task, { nextStep: nextStep.trim() });
    }
    if (reason === "too_big") {
      for (const title of steps) {
        if (title.trim()) {
          await actions.createTask({
            title: title.trim(),
            parentTaskId: task.id,
            status: "todo",
            areaId: task.areaId,
            goalId: task.goalId,
          });
        }
      }
    }
    await actions.skipTask(task, { reason, reasonText: reasonText || null, to: toDay, todayDay });
    onClose();
    toast({ message: toDay ? `Moved to ${dayLabel(toDay, todayDay).toLowerCase()}` : "Moved off your plan" });
  }

  async function cancelTask() {
    await actions.skipTask(task, { reason, reasonText: reasonText || null, to: null, todayDay, cancel: true });
    onClose();
    toast({ message: "Task cancelled" });
  }

  async function startFive() {
    onClose();
    await focus.start(task, "five");
  }

  if (step === "reason") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-callout text-label-secondary">
          {(task.postponeCount ?? 0) >= 2
            ? `This one's been moved ${task.postponeCount} times. What's getting in the way?`
            : "What's getting in the way?"}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SKIP_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setReason(r.id);
                setStep("move");
              }}
              className="min-h-14 rounded-lg bg-fill px-3 py-2 text-left text-callout font-medium hover:bg-fill-strong active:scale-[0.98] active:bg-fill-strong"
            >
              {r.label}
            </button>
          ))}
        </div>
        {!reasonRequired ? (
          <Button variant="ghost" className="self-start" onClick={() => setStep("move")}>
            Move without a reason
          </Button>
        ) : null}
      </div>
    );
  }

  const meta = SKIP_REASONS.find((r) => r.id === reason);
  const input =
    "h-control w-full rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";
  const otherMissing = reason === "other" && !reasonText.trim();

  return (
    <div className="flex flex-col gap-4">
      {planned ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep("reason")}
            aria-label="Change reason"
            className="grid size-9 place-items-center rounded-full hover:bg-fill"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="text-headline">{meta?.label ?? "No reason"}</p>
            {meta ? <p className="text-footnote text-label-secondary">{meta.hint}</p> : null}
          </div>
        </div>
      ) : null}

      {reason === "too_big" ? (
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <input
              key={i}
              aria-label={`Smaller step ${i + 1}`}
              value={s}
              onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={i === 0 ? "The smallest first step" : "Then…"}
              className={input}
            />
          ))}
        </div>
      ) : null}

      {reason === "unclear" ? (
        <input
          aria-label="Next step"
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="Next step — something you can start in 2 minutes"
          className={input}
        />
      ) : null}

      {reason === "other" ? (
        <input
          aria-label="What's in the way"
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          placeholder="What's in the way?"
          className={input}
        />
      ) : null}

      {reason === "avoiding" || reason === "low_energy" ? (
        <Button variant={reason === "avoiding" ? "primary" : "secondary"} onClick={() => void startFive()}>
          Start 5 minutes now
        </Button>
      ) : null}

      {reason === "not_important" ? (
        <Button variant="destructive" onClick={() => void cancelTask()}>
          Cancel task
        </Button>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-footnote font-medium text-label-secondary">
          {reason === "waiting" ? "Follow up on" : reason === "not_important" ? "Or move it to" : "Move to"}
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="New date">
          {choices.map(([label, d]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={to === d}
              onClick={() => setTo(d)}
              className={cn(
                "h-9 rounded-full px-3.5 text-callout font-medium",
                to === d ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
              )}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            aria-label="Pick a date"
            min={addDays(todayDay, 1)}
            value={to !== SOMEDAY && !choices.some(([, d]) => d === to) ? to : ""}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="h-9 rounded-full bg-fill px-3 text-callout outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
      </div>

      <Button
        variant={reason === "avoiding" || reason === "not_important" ? "secondary" : "primary"}
        disabled={otherMissing}
        onClick={() => void move()}
      >
        {toDay ? `Move to ${dayLabel(toDay, todayDay).toLowerCase()}` : "Move off my plan"}
      </Button>
    </div>
  );
}
