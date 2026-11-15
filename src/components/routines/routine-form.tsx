"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { useActions } from "@/features/actions";
import { useHabits, type RoutineDoc } from "@/features/data";
import { newStepId, ROUTINE_KIND_LABEL, type RoutineFields, type RoutineStep } from "@/features/routines/model";
import { cn } from "@/lib/cn";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const small =
  "h-9 rounded-md bg-surface-sunken px-2 text-callout outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** HAB-5: make or edit a routine — its steps in order, which days, and when to remind you. */
export function RoutineForm({
  open,
  onClose,
  routine,
}: {
  open: boolean;
  onClose: () => void;
  routine?: RoutineDoc | null;
}) {
  const actions = useActions();
  const habits = useHabits() ?? [];
  const [name, setName] = useState(routine?.name ?? "");
  const [kind, setKind] = useState<RoutineFields["kind"]>(routine?.kind ?? "morning");
  const [steps, setSteps] = useState<RoutineStep[]>(routine?.steps ?? []);
  const [draft, setDraft] = useState("");
  const [days, setDays] = useState<number[]>(routine?.days ?? []);
  const [reminder, setReminder] = useState(routine?.reminderTime ?? "");
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    if (!draft.trim()) return;
    setSteps((s) => [...s, { id: newStepId(s), text: draft.trim(), minutes: null, habitId: null }]);
    setDraft("");
  };
  const set = (id: string, patch: Partial<RoutineStep>) =>
    setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) =>
    setSteps((s) => {
      const next = [...s];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={routine ? "Edit routine" : "New routine"}
      width={540}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const all = draft.trim()
            ? [...steps, { id: newStepId(steps), text: draft.trim(), minutes: null, habitId: null }]
            : steps;
          if (!name.trim() || !all.length) return;
          setSaving(true);
          const fields = {
            name: name.trim(),
            kind,
            steps: all,
            days: [...days].sort(),
            reminderTime: reminder || null,
          };
          if (routine) await actions.updateRoutine(routine.id, fields);
          else await actions.createRoutine(fields);
          setSaving(false);
          onClose();
        }}
      >
        <Field label="Name">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning start"
            maxLength={120}
          />
        </Field>
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          options={(["morning", "evening", "other"] as const).map((k) => ({ value: k, label: ROUTINE_KIND_LABEL[k] }))}
        />

        <div className="flex flex-col gap-2">
          <span className="text-footnote font-medium text-label-secondary">Steps, in order</span>
          <ol aria-label="Steps" className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.id} className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken p-2">
                <div className="flex items-center gap-1">
                  <span className="w-5 text-center text-footnote text-label-tertiary tabular">{i + 1}</span>
                  <input
                    aria-label={`Step ${i + 1}`}
                    value={s.text}
                    onChange={(e) => set(s.id, { text: e.target.value })}
                    maxLength={200}
                    className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-body outline-none focus-visible:bg-surface"
                  />
                  <IconButton
                    label={`Move step ${i + 1} up`}
                    icon={<ArrowUp className="size-4" />}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  />
                  <IconButton
                    label={`Move step ${i + 1} down`}
                    icon={<ArrowDown className="size-4" />}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                  />
                  <IconButton
                    label={`Remove step ${i + 1}`}
                    icon={<X className="size-4" />}
                    onClick={() => setSteps((x) => x.filter((y) => y.id !== s.id))}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <label className="flex items-center gap-1.5 text-footnote text-label-secondary">
                    <input
                      type="number"
                      min={1}
                      max={240}
                      aria-label={`Minutes for step ${i + 1}`}
                      value={s.minutes ?? ""}
                      placeholder="–"
                      onChange={(e) =>
                        set(s.id, {
                          minutes: e.target.value ? Math.max(1, Math.min(240, Number(e.target.value))) : null,
                        })
                      }
                      className={cn(small, "w-16 bg-surface")}
                    />
                    min
                  </label>
                  {habits.length ? (
                    <select
                      aria-label={`Habit for step ${i + 1}`}
                      value={s.habitId ?? ""}
                      onChange={(e) => set(s.id, { habitId: e.target.value || null })}
                      className={cn(small, "max-w-56 bg-surface")}
                    >
                      <option value="">No habit</option>
                      {habits.map((h) => (
                        <option key={h.id} value={h.id}>
                          Ticks “{h.name}”
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <input
              aria-label="New step"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addStep();
                }
              }}
              placeholder={steps.length ? "Another step" : "First step, e.g. Glass of water"}
              maxLength={200}
              className="h-control min-w-0 flex-1 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
            />
            <Button
              type="button"
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={addStep}
              disabled={!draft.trim()}
            >
              Add step
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-footnote font-medium text-label-secondary">
            Days {days.length ? "" : "(every day)"}
          </span>
          <div className="flex gap-1">
            {DAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                aria-label={DAY_NAMES[i]}
                aria-pressed={days.includes(i)}
                onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}
                className={cn(
                  "grid size-9 place-items-center rounded-full text-footnote font-semibold",
                  days.includes(i) ? "bg-accent text-on-accent" : "bg-fill text-label-secondary",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span className="text-footnote font-medium text-label-secondary">Remind me at (optional)</span>
          <input
            type="time"
            aria-label="Reminder time"
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            className="rounded-md bg-fill px-2 py-1 text-body text-label"
          />
        </label>

        <div className="mt-2 flex items-center gap-2">
          {routine ? (
            <Button
              type="button"
              variant="ghost"
              icon={<Trash2 className="size-4 text-danger-text" />}
              onClick={() => {
                void actions.deleteRoutine(routine.id);
                onClose();
              }}
            >
              <span className="text-danger-text">Delete</span>
            </Button>
          ) : null}
          <span className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!name.trim() || (!steps.length && !draft.trim())}>
              {routine ? "Save" : "Create routine"}
            </Button>
          </span>
        </div>
      </form>
    </Modal>
  );
}
