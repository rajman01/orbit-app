"use client";

import { useMemo, useState } from "react";
import { useSkipFlow } from "@/components/skip/skip-flow";
import { useTaskLookups } from "@/components/tasks/task-list";
import { Checkbox } from "@/components/ui/checkbox";
import { useActions } from "@/features/actions";
import { areaColorVar } from "@/features/areas/model";
import { useAllTasks, useSettings, type RitualDoc } from "@/features/data";
import { isOpen, type Task } from "@/features/tasks/model";
import { buildToday, buildUpcoming } from "@/features/today/model";
import { useMinuteNow, useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, longDayLabel } from "@/lib/dates";
import { EmptyStepNote, RitualShell, RitualTaskRow, SmallButton, type RitualStep } from "./ritual-flow";

const MOOD = ["Rough", "Meh", "Okay", "Good", "Great"];
const ENERGY = ["Drained", "Low", "Steady", "Good", "Buzzing"];

/**
 * PRD RIT-2: the evening shutdown. Mark what got done → decide on what's left (through the
 * skip flow) → mood and energy → one line about today → a look at tomorrow.
 */
export function DailyShutdownFlow({ ritual, onClose }: { ritual: RitualDoc; onClose: () => void }) {
  const actions = useActions();
  const skip = useSkipFlow();
  const settings = useSettings();
  const todayDay = useToday();
  const now = useMinuteNow();
  const allTasks = useAllTasks();
  const all = useMemo(() => allTasks ?? [], [allTasks]);
  const { areaById } = useTaskLookups();
  const color = (t: Task) => (t.areaId ? areaColorVar(areaById.get(t.areaId)?.color) : undefined);
  const strict = settings.strictness !== "gentle";
  const data = ritual.data as { mood?: number; energy?: number; note?: string };
  const [note, setNote] = useState(data.note ?? "");

  const plan = useMemo(
    () =>
      buildToday(all, {
        today: todayDay,
        now,
        timezone: settings.timezone,
        capacity: settings.dailyCapacityPts,
      }),
    [all, now, todayDay, settings.timezone, settings.dailyCapacityPts],
  );
  const planned = [...plan.mustDos, ...plan.also, ...plan.doneToday];
  const left = [...plan.mustDos, ...plan.also].filter(isOpen);
  const tomorrow = addDays(todayDay, 1);
  const tomorrowTasks = buildUpcoming(all, todayDay, 1).find((g) => g.day === tomorrow)?.tasks ?? [];
  const tomorrowPts = tomorrowTasks.reduce((s, t) => s + (t.effort ?? 0), 0);

  const scale = (key: "mood" | "energy", labels: string[]) => (
    <div role="radiogroup" aria-label={key === "mood" ? "Mood" : "Energy"} className="grid grid-cols-5 gap-2">
      {labels.map((label, i) => {
        const value = i + 1;
        const on = data[key] === value;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => void actions.saveRitual(ritual.id, { [key]: value })}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg px-1 py-3 text-footnote font-medium transition-colors",
              on ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
            )}
          >
            <span className="flex gap-0.5" aria-hidden>
              {Array.from({ length: 5 }, (_, j) => (
                <span
                  key={j}
                  className={cn("size-1.5 rounded-full", j <= i ? "bg-current" : "bg-current opacity-20")}
                />
              ))}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );

  const steps: RitualStep[] = [
    {
      id: "done",
      title: "What got done today?",
      hint: planned.length ? "Tick off anything you finished." : undefined,
      body: planned.length ? (
        <ul>
          {planned.map((t) => (
            <RitualTaskRow key={t.id} title={t.title} areaColor={color(t)} done={t.status === "done"}>
              <Checkbox
                checked={t.status === "done"}
                onChange={(d) => void actions.setTaskDone(t, d)}
                label={`Complete ${t.title}`}
              />
            </RitualTaskRow>
          ))}
        </ul>
      ) : (
        <EmptyStepNote>Nothing was planned for today.</EmptyStepNote>
      ),
    },
    {
      id: "left",
      title: left.length ? "Decide on what's left" : "Nothing left over",
      hint: left.length ? "Each one gets a new day and a reason. Nothing slips by silently." : undefined,
      blockedBy: strict && left.length ? `Decide on ${left.length} more to continue` : null,
      body: left.length ? (
        <ul>
          {left.map((t) => (
            <RitualTaskRow
              key={t.id}
              title={t.title}
              areaColor={color(t)}
              sub={t.mustDoDate === todayDay ? "Must-do" : undefined}
            >
              <SmallButton tone="accent" onClick={() => skip.open(t, { to: tomorrow })} label={`Move ${t.title}`}>
                Move
              </SmallButton>
            </RitualTaskRow>
          ))}
        </ul>
      ) : (
        <EmptyStepNote>Everything planned for today is done.</EmptyStepNote>
      ),
    },
    {
      id: "feel",
      title: "How was today?",
      blockedBy: data.mood && data.energy ? null : "Pick both to continue",
      body: (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-headline">Mood</p>
            {scale("mood", MOOD)}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-headline">Energy</p>
            {scale("energy", ENERGY)}
          </div>
        </div>
      ),
    },
    {
      id: "note",
      title: "One line about today",
      hint: "What went well, what got in the way, anything worth remembering.",
      continueLabel: note.trim() ? undefined : "Skip",
      body: (
        <textarea
          aria-label="One line about today"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (data.note ?? "") && void actions.saveRitual(ritual.id, { note: note.trim() })}
          rows={3}
          maxLength={500}
          placeholder="e.g. Finally sent the CV. Lost the afternoon to emails."
          className="field-sizing-content min-h-24 w-full resize-none rounded-lg bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
        />
      ),
    },
    {
      id: "tomorrow",
      title: "Tomorrow",
      hint: `${longDayLabel(tomorrow)} · ${tomorrowTasks.length} ${tomorrowTasks.length === 1 ? "task" : "tasks"}${
        tomorrowPts ? ` · ${tomorrowPts} of ${settings.dailyCapacityPts} pts` : ""
      }`,
      body: tomorrowTasks.length ? (
        <ul>
          {tomorrowTasks.map((t) => (
            <RitualTaskRow
              key={t.id}
              title={t.title}
              areaColor={color(t)}
              sub={t.nextStep ? `↳ ${t.nextStep}` : undefined}
            />
          ))}
        </ul>
      ) : (
        <EmptyStepNote>Nothing planned yet. You&rsquo;ll pick tomorrow&rsquo;s Must-dos in the morning.</EmptyStepNote>
      ),
    },
  ];

  return (
    <RitualShell
      ritual={ritual}
      steps={steps}
      onClose={onClose}
      finishLabel="Close the day"
      onFinish={() =>
        actions.completeRitual(ritual.id, {
          note: note.trim(),
          done: planned.filter((t) => t.status === "done").length,
          planned: planned.length,
        })
      }
    />
  );
}
