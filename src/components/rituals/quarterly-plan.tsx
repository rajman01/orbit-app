"use client";

import { AlertTriangle, Check, Diamond, Heart, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useActions } from "@/features/actions";
import {
  useAllTasks,
  useGoals,
  useKeyResults,
  useMilestones,
  useQuarters,
  useSettings,
  useVision,
  type RitualDoc,
} from "@/features/data";
import type { Goal } from "@/features/goals/model";
import {
  elapsedShare,
  monthsLeft,
  quarterDates,
  quarterDaysLeft,
  quarterLabel,
  quarterOf,
  quarterPlanningGate,
  yearTheme,
} from "@/features/quarters/model";
import { useQuarter } from "@/features/quarters/use-quarter";
import { isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { EmptyStepNote, RitualShell, type RitualStep } from "./ritual-flow";

/** A field on a grey card: white, so it stands out. */
const onCard =
  "h-control min-w-0 rounded-md bg-surface px-3 text-body text-label outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";
const field =
  "h-control min-w-0 rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";

/**
 * QTR-2 / RIT-7: the Quarterly Plan. The long view → choose 3–5 goals (1–3 when planning partway
 * through) → a target date and a key result each → monthly milestones → capacity check → commit.
 */
export function QuarterlyPlanFlow({ ritual, onClose }: { ritual: RitualDoc; onClose: () => void }) {
  const actions = useActions();
  const settings = useSettings();
  const todayDay = useToday();
  const ref = useMemo(() => quarterOf(ritual.date), [ritual.date]);
  const quarter = useQuarter(ref);
  const quarters = useQuarters() ?? [];
  const vision = useVision();
  const allGoals = useGoals() ?? [];
  const krs = useKeyResults() ?? [];
  const milestones = useMilestones() ?? [];
  const tasks = useAllTasks() ?? [];
  const dates = quarterDates(ref);
  const label = quarterLabel(ref);
  const from = todayDay > dates.startDate ? todayDay : dates.startDate;
  const short = dates.startDate <= todayDay && elapsedShare(dates, todayDay) > 1 / 3;
  const [min, max] = short ? [1, 3] : [3, 5];
  const data = ritual.data as { goalIds?: string[] };
  const [chosen, setChosenState] = useState<string[] | null>(data.goalIds ?? null);
  const picked = chosen ?? quarter?.doc?.goalIds ?? [];
  const setChosen = (ids: string[]) => {
    setChosenState(ids);
    void actions.saveRitual(ritual.id, { goalIds: ids });
  };
  const [newGoal, setNewGoal] = useState("");
  const [theme, setTheme] = useState<string | null>(null);
  const [yearText, setYearText] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const gate = quarterPlanningGate(quarters, ref, todayDay, settings.strictness);
  const goals = picked.map((id) => allGoals.find((g) => g.id === id)).filter((g) => g != null);
  const choices = allGoals.filter(
    (g) => picked.includes(g.id) || g.status === "active" || g.status === "planned" || g.status === "paused",
  );
  const missingKr = goals.filter((g) => !krs.some((k) => k.goalId === g.id));
  const year = ref.year;

  // Capacity (QTR-2): the chosen goals' open work against the cycles left in the quarter.
  const daysLeft = quarterDaysLeft(dates, from) + 1;
  const cyclesLeft = Math.max(1, Math.round(daysLeft / settings.cycleLengthDays));
  const capacity = cyclesLeft * settings.cycleCapacityPts;
  const openWork = tasks.filter((t) => t.goalId && picked.includes(t.goalId) && isOpen(t) && !t.parentTaskId);
  const points = openWork.reduce((s, t) => s + (t.effort ?? 0), 0);
  const unestimated = openWork.filter((t) => !t.effort).length;

  if (gate.blocked) {
    const prev = quarterLabel(gate.quarter);
    return (
      <RitualShell
        ritual={ritual}
        onClose={onClose}
        finishLabel="Plan anyway"
        onFinish={async () => {
          if (overrideReason.trim()) await actions.overrideQuarterPlanning(ref, overrideReason);
        }}
        steps={[
          {
            id: "gate",
            title: `Review ${prev} first`,
            hint: "Deciding what happens to last quarter's goals comes before choosing new ones.",
            blockedBy: gate.canOverride
              ? overrideReason.trim()
                ? null
                : "Give a reason to plan anyway"
              : "Strict mode: the review can't be skipped",
            body: gate.canOverride ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-footnote font-medium text-label-secondary">
                  Or plan anyway — why are you skipping the review?
                </span>
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Was travelling, will catch up next week"
                  className={field}
                />
              </label>
            ) : (
              <EmptyStepNote>Finish the {prev} review from Today, then come back.</EmptyStepNote>
            ),
          },
        ]}
      />
    );
  }

  const steps: RitualStep[] = [
    {
      id: "long-view",
      title: "Start from the long view",
      hint: short
        ? `${label} is already partway through: choose 1–3 goals for the ${daysLeft} days left.`
        : `What should ${label} move forward?`,
      body: (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">Your theme for {year}</span>
            <input
              value={yearText ?? yearTheme(vision, year)}
              onChange={(e) => setYearText(e.target.value)}
              onBlur={() => yearText != null && void actions.setYearTheme(year, yearText)}
              placeholder="One phrase for the year"
              maxLength={120}
              className={field}
            />
          </label>
          {vision?.oneYear ? (
            <div>
              <p className="text-footnote font-medium text-label-secondary">In a year</p>
              <p className="mt-1 text-callout whitespace-pre-wrap">{vision.oneYear}</p>
            </div>
          ) : null}
          {vision?.values.length ? (
            <div>
              <p className="text-footnote font-medium text-label-secondary">Your values</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {vision.values.map((v) => (
                  <li
                    key={v.id}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-fill px-2.5 text-footnote font-medium"
                  >
                    <Heart className="size-3 text-accent-text" /> {v.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-footnote text-label-secondary">
              No values yet.{" "}
              <Link href="/vision" className="font-semibold text-accent-text" onClick={onClose}>
                Set them on the Vision page
              </Link>{" "}
              to see them here.
            </p>
          )}
        </div>
      ),
    },
    {
      id: "goals",
      title: short ? "Choose 1–3 goals" : "Choose 3–5 goals",
      hint: "The few that would make this quarter a success. Everything else can wait.",
      blockedBy: picked.length ? null : "Choose at least one goal",
      body: (
        <div className="flex flex-col gap-3">
          <p
            className={cn(
              "text-footnote font-medium tabular",
              picked.length > max ? "text-warning-text" : "text-label-secondary",
            )}
          >
            {picked.length} chosen
            {picked.length > max
              ? ` — more than ${max} is a lot for ${short ? "the weeks left" : "a quarter"}`
              : picked.length < min
                ? ` — aim for ${min}–${max}`
                : ""}
          </p>
          <ul aria-label="Goals to choose from" className="flex flex-col gap-1">
            {choices.map((g) => {
              const on = picked.includes(g.id);
              const carried = quarter?.doc?.goalIds.includes(g.id) && !quarter.doc.committedAt;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen(on ? picked.filter((x) => x !== g.id) : [...picked, g.id])}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                      on ? "bg-accent-fill" : "bg-surface-sunken hover:bg-fill",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border",
                        on ? "border-accent bg-accent text-on-accent" : "border-separator",
                      )}
                      aria-hidden
                    >
                      {on ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 text-callout">{g.title}</span>
                    {carried ? <span className="text-caption text-label-tertiary">Carried over</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newGoal.trim()) return;
              const id = await actions.createGoal({
                title: newGoal.trim(),
                status: "active",
                targetDate: dates.endDate,
              });
              setChosen([...picked, id]);
              setNewGoal("");
            }}
          >
            <input
              aria-label="New goal"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="A new goal for this quarter"
              className={cn(field, "flex-1")}
            />
            <Button
              type="submit"
              variant="secondary"
              aria-label="Add goal"
              icon={<Plus className="size-4" />}
              disabled={!newGoal.trim()}
            >
              Add
            </Button>
          </form>
        </div>
      ),
    },
    {
      id: "concrete",
      title: "Make each one concrete",
      hint: `A target date by ${shortDate(dates.endDate)} and at least one key result: how you'll know it's done.`,
      blockedBy: missingKr.length
        ? `Give ${missingKr.length === 1 ? "this goal" : `${missingKr.length} goals`} a key result`
        : null,
      body: (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => (
            <ConcreteGoal
              key={g.id}
              goal={g}
              krs={krs.filter((k) => k.goalId === g.id).map((k) => k.title)}
              end={dates.endDate}
              from={from}
            />
          ))}
        </ul>
      ),
    },
    {
      id: "milestones",
      title: "Break it into months",
      hint: "Where should each goal be by the end of each month? Optional, but it makes slipping visible early.",
      body: (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => (
            <MonthlyMilestones
              key={g.id}
              goal={g}
              months={monthsLeft(ref, from)}
              existing={milestones.filter((m) => m.goalId === g.id)}
            />
          ))}
        </ul>
      ),
    },
    {
      id: "capacity",
      title: "Is it realistic?",
      hint: `About ${cyclesLeft} cycle${cyclesLeft === 1 ? "" : "s"} left in ${label}: roughly ${capacity} pts at your capacity.`,
      body: (
        <div className="flex flex-col gap-3">
          <p className="text-callout">
            The open tasks for these goals add up to <strong className="font-semibold">{points} pts</strong>
            {unestimated ? ` (plus ${unestimated} not estimated)` : ""}.
          </p>
          {picked.length > max || points > capacity ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-callout">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              {picked.length > max
                ? `${picked.length} goals is more than ${max}. Which one could wait for next quarter?`
                : `That's more than fits in ${cyclesLeft} cycle${cyclesLeft === 1 ? "" : "s"}. Consider a smaller key result or one goal fewer.`}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-callout text-success-text">
              <Check className="size-4" /> Looks doable. Most of the work isn&rsquo;t planned yet, which is normal.
            </p>
          )}
        </div>
      ),
    },
    {
      id: "commit",
      title: "Commit",
      hint: "Cycle planning will put these goals first all quarter.",
      blockedBy: committed ? null : "Tick the box to commit",
      body: (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">What is {label} about? (optional)</span>
            <input
              aria-label="Quarter theme"
              value={theme ?? quarter?.doc?.theme ?? ""}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. Get hired, get fit"
              maxLength={200}
              className={field}
            />
          </label>
          <ul className="flex flex-col gap-1.5">
            {goals.map((g, i) => (
              <li key={g.id} className="flex items-center gap-3 rounded-lg bg-surface-sunken px-3 py-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-fill text-footnote font-bold text-accent-text">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-callout">{g.title}</span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-3 text-callout">
            <input
              type="checkbox"
              checked={committed}
              onChange={(e) => setCommitted(e.target.checked)}
              className="mt-0.5 size-5 accent-[var(--accent)]"
            />
            <span>
              I commit to these <strong className="font-semibold">{goals.length} goals</strong> for {label}.
            </span>
          </label>
        </div>
      ),
    },
  ];

  return (
    <RitualShell
      ritual={ritual}
      steps={steps}
      onClose={onClose}
      finishLabel={`Commit to ${label}`}
      onFinish={async () => {
        // Each goal gets a date inside the quarter.
        for (const g of goals) {
          if (!g.targetDate || g.targetDate > dates.endDate || g.targetDate < dates.startDate)
            await actions.updateGoal(g.id, { targetDate: dates.endDate });
          if (g.status === "planned" || g.status === "paused") await actions.updateGoal(g.id, { status: "active" });
        }
        await actions.commitQuarter(ref, { goalIds: picked, theme: theme ?? quarter?.doc?.theme ?? null });
        await actions.completeRitual(ritual.id, { goalIds: picked, short });
      }}
    />
  );
}

const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" });

function ConcreteGoal({ goal, krs, end, from }: { goal: Goal; krs: string[]; end: string; from: string }) {
  const actions = useActions();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const date = goal.targetDate && goal.targetDate <= end && goal.targetDate >= from ? goal.targetDate : end;
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-3">
      <p className="flex items-center gap-2 text-headline">
        <Target className="size-4 shrink-0 text-label-secondary" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">{goal.title}</span>
      </p>
      <label className="flex items-center gap-2 text-footnote text-label-secondary">
        Target date
        <input
          type="date"
          aria-label={`Target date for ${goal.title}`}
          value={date}
          min={from}
          max={end}
          onChange={(e) => e.target.value && void actions.updateGoal(goal.id, { targetDate: e.target.value })}
          className="h-9 rounded-md bg-surface px-2 text-callout text-label outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
      {krs.length ? (
        <ul className="flex flex-col gap-1">
          {krs.map((k, i) => (
            <li key={i} className="flex items-center gap-2 text-callout">
              <Check className="size-3.5 text-success-text" /> {k}
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(target);
          if (!title.trim() || !Number.isFinite(n) || n <= 0) return;
          void actions.createKeyResult(goal.id, {
            title: title.trim(),
            type: "number",
            start: 0,
            target: n,
            unit: unit.trim() || null,
          });
          setTitle("");
          setTarget("");
          setUnit("");
        }}
      >
        <input
          aria-label={`Key result for ${goal.title}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={krs.length ? "Another key result" : "Key result, e.g. Applications sent"}
          className={cn(onCard, "min-w-40 flex-1")}
        />
        <input
          aria-label={`Target for ${goal.title}`}
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target"
          className={cn(onCard, "w-24")}
        />
        <input
          aria-label={`Unit for ${goal.title}`}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Unit"
          className={cn(onCard, "w-24")}
        />
        <Button
          type="submit"
          variant="secondary"
          aria-label={`Add key result to ${goal.title}`}
          disabled={!title.trim() || !(Number(target) > 0)}
        >
          Add
        </Button>
      </form>
    </li>
  );
}

function MonthlyMilestones({
  goal,
  months,
  existing,
}: {
  goal: Goal;
  months: { label: string; end: string }[];
  existing: { id: string; title: string; dueDate: string | null }[];
}) {
  const actions = useActions();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-3">
      <p className="flex items-center gap-2 text-headline">
        <Target className="size-4 shrink-0 text-label-secondary" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">{goal.title}</span>
      </p>
      {months.map((m) => {
        const done = existing.filter((x) => x.dueDate && x.dueDate.slice(0, 7) === m.end.slice(0, 7));
        return (
          <div key={m.end} className="flex flex-col gap-1">
            <span className="text-footnote font-medium text-label-secondary">By the end of {m.label}</span>
            {done.map((x) => (
              <span key={x.id} className="flex items-center gap-2 text-callout">
                <Diamond className="size-3.5 text-accent-text" /> {x.title}
              </span>
            ))}
            {!done.length ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = drafts[m.end]?.trim();
                  if (!t) return;
                  void actions.createMilestone(goal.id, t, m.end);
                  setDrafts({ ...drafts, [m.end]: "" });
                }}
              >
                <input
                  aria-label={`${goal.title}: milestone for ${m.label}`}
                  value={drafts[m.end] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [m.end]: e.target.value })}
                  placeholder="e.g. Portfolio site live"
                  className={cn(onCard, "flex-1")}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  aria-label={`Add milestone for ${m.label}`}
                  disabled={!drafts[m.end]?.trim()}
                >
                  Add
                </Button>
              </form>
            ) : null}
          </div>
        );
      })}
    </li>
  );
}
