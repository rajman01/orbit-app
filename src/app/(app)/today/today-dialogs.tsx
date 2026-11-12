"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { useFocus } from "@/components/focus/focus-mode";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import type { Task } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayLabel, weekday, type Day } from "@/lib/dates";

const input =
  "h-control w-full rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";

/** TASK-4: a big task planned for today gets a 2-minute next step, so starting is easy. */
export function NextStepDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const actions = useActions();
  const [value, setValue] = useState("");
  return (
    <Modal
      open={task != null}
      onOpenChange={(o) => {
        if (!o) {
          setValue("");
          onClose();
        }
      }}
      title="What's the first step?"
      description={task ? `“${task.title}” is a big one. Pick something you can start in 2 minutes.` : undefined}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (task && value.trim()) void actions.updateTask(task, { nextStep: value.trim() });
          setValue("");
          onClose();
        }}
      >
        <input
          autoFocus
          aria-label="Next step"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Open the doc and write the first heading"
          className={input}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button type="submit" disabled={!value.trim()}>
            Save next step
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** TODAY-2: a 4th Must-do means swapping one out. */
export function SwapMustDoDialog({
  incoming,
  mustDos,
  onSwap,
  onClose,
}: {
  incoming: Task | null;
  mustDos: Task[];
  onSwap: (out: Task) => void;
  onClose: () => void;
}) {
  const open = mustDos.filter((t) => t.status !== "done");
  return (
    <Modal
      open={incoming != null}
      onOpenChange={(o) => !o && onClose()}
      title="Swap a Must-do"
      description={
        open.length
          ? "You can have 3 Must-dos a day. Which one makes way?"
          : "You've finished your 3 Must-dos today. Nice — keep going from Also today."
      }
    >
      <div className="flex flex-col gap-2">
        {open.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSwap(t)}
            className="flex min-h-12 items-center gap-3 rounded-lg bg-fill px-3 text-left text-body hover:bg-fill-strong"
          >
            <Star className="size-4 shrink-0 text-warning" fill="currentColor" />
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <span className="text-footnote text-label-secondary">Swap out</span>
          </button>
        ))}
        <Button variant="ghost" className="self-end" onClick={onClose}>
          Keep my Must-dos
        </Button>
      </div>
    </Modal>
  );
}

export type StaleAction = "break_down" | "five_minutes" | "commit" | "help" | "drop";

export const STALE_ACTIONS: { id: StaleAction; label: string }[] = [
  { id: "break_down", label: "Break it down" },
  { id: "five_minutes", label: "Do 5 minutes now" },
  { id: "commit", label: "Reschedule" },
  { id: "help", label: "Ask for help" },
  { id: "drop", label: "Drop it" },
];

/** PRD §8.1 — the five ways to resolve a stale task. "Do 5 minutes" and "Drop" act immediately. */
export function useStaleResolver() {
  const actions = useActions();
  const focus = useFocus();
  const toast = useToast();
  const [pending, setPending] = useState<{ task: Task; action: StaleAction } | null>(null);

  async function run(task: Task, action: StaleAction) {
    if (action === "five_minutes") {
      await actions.resolveStale(task, "five_minutes");
      await focus.start(task, "five");
    } else if (action === "drop") {
      await actions.resolveStale(task, "drop");
      toast({
        message: "Task dropped",
        action: {
          label: "Undo",
          onClick: () => void actions.updateTask({ ...task, status: "cancelled" }, { status: task.status }),
        },
      });
    } else {
      setPending({ task, action });
    }
  }

  const dialog = <StaleDialog pending={pending} onClose={() => setPending(null)} />;
  return { run, dialog };
}

function StaleDialog({
  pending,
  onClose,
}: {
  pending: { task: Task; action: StaleAction } | null;
  onClose: () => void;
}) {
  const titles: Record<StaleAction, string> = {
    break_down: "Break it down",
    five_minutes: "",
    commit: "Reschedule with commitment",
    help: "Ask for help",
    drop: "",
  };
  return (
    <Modal open={pending != null} onOpenChange={(o) => !o && onClose()} title={pending ? titles[pending.action] : ""}>
      {pending ? <StaleForm key={pending.task.id + pending.action} {...pending} onClose={onClose} /> : null}
    </Modal>
  );
}

function StaleForm({ task, action, onClose }: { task: Task; action: StaleAction; onClose: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const [steps, setSteps] = useState(["", "", ""]);
  const [note, setNote] = useState("");
  const [to, setTo] = useState<Day>(addDays(todayDay, 1));
  const [committed, setCommitted] = useState(false);
  const nextMonday = addDays(todayDay, (8 - weekday(todayDay)) % 7 || 7);

  if (action === "break_down") {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void actions.resolveStale(task, "break_down", { subtasks: steps });
          onClose();
          toast({ message: "Broken into smaller steps" });
        }}
      >
        <p className="mb-1 text-callout text-label-secondary">Smaller steps are easier to start. What are they?</p>
        {steps.map((s, i) => (
          <input
            key={i}
            autoFocus={i === 0}
            aria-label={`Smaller step ${i + 1}`}
            value={s}
            onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={i === 0 ? "The smallest first step" : "Then…"}
            className={input}
          />
        ))}
        <Button type="submit" className="mt-2" disabled={!steps.some((s) => s.trim())}>
          Add steps
        </Button>
      </form>
    );
  }

  if (action === "help") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void actions.resolveStale(task, "help", { note });
          onClose();
          toast({ message: "Noted on the task" });
        }}
      >
        <p className="text-callout text-label-secondary">
          Who could help, or what would you ask? It&rsquo;s saved to the task&rsquo;s notes.
        </p>
        <input
          autoFocus
          aria-label="Who or what would help"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Ask Sam how they set up theirs"
          className={input}
        />
        <Button type="submit" disabled={!note.trim()}>
          Save
        </Button>
      </form>
    );
  }

  const choices: [string, Day][] = [
    ["Tomorrow", addDays(todayDay, 1)],
    ["In 2 days", addDays(todayDay, 2)],
    ["Next week", nextMonday],
  ];
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void actions.resolveStale(task, "commit", { to });
        onClose();
        toast({ message: `Committed to ${dayLabel(to, todayDay).toLowerCase()}` });
      }}
    >
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
          value={choices.some(([, d]) => d === to) ? "" : to}
          onChange={(e) => e.target.value && setTo(e.target.value)}
          className="h-9 rounded-full bg-fill px-3 text-callout outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>
      <label className="flex items-start gap-3 rounded-lg bg-fill p-3 text-callout">
        <input
          type="checkbox"
          checked={committed}
          onChange={(e) => setCommitted(e.target.checked)}
          className="mt-0.5 size-5 accent-[var(--accent)]"
        />
        <span>
          I commit to doing <strong className="font-semibold">{task.title}</strong>{" "}
          {dayLabel(to, todayDay).toLowerCase() === "tomorrow" ? "tomorrow" : `on ${dayLabel(to, todayDay)}`}.
        </span>
      </label>
      <Button type="submit" disabled={!committed}>
        Commit
      </Button>
    </form>
  );
}
