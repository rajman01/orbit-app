"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Target } from "lucide-react";
import { useMemo, useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { CyclePlanner } from "@/components/cycles/planner";
import { useTaskLookups } from "@/components/tasks/task-list";
import { useActions } from "@/features/actions";
import { areaColorVar } from "@/features/areas/model";
import { cyclePoints, unfinishedInCycle } from "@/features/cycles/model";
import {
  useAllTasks,
  useCycles,
  useFocusSessions,
  useGoals,
  useKeyResults,
  useSettings,
  type RitualDoc,
} from "@/features/data";
import { goalProgress, HEALTH_META, type GoalHealth } from "@/features/goals/model";
import type { Task } from "@/features/tasks/model";
import { buildToday } from "@/features/today/model";
import { useMinuteNow, useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayOf } from "@/lib/dates";
import { EmptyStepNote, RitualShell, RitualTaskRow, SmallButton, type RitualStep } from "./ritual-flow";

type ReviewData = { wins?: string[]; wentWell?: string; inTheWay?: string; change?: string };

/**
 * PRD RIT-3 / CYC-4: the cycle review. Stats → a decision on every unfinished task → goal
 * check-in → stale cleanup → wins → reflection → plan the next cycle.
 */
export function CycleReviewFlow({ ritual, onClose }: { ritual: RitualDoc; onClose: () => void }) {
  const actions = useActions();
  const { db } = useSync();
  const settings = useSettings();
  const todayDay = useToday();
  const now = useMinuteNow();
  const allTasks = useAllTasks();
  const all = useMemo(() => allTasks ?? [], [allTasks]);
  const cycles = useCycles() ?? [];
  const goals = (useGoals() ?? []).filter((g) => g.status === "active");
  const krs = useKeyResults() ?? [];
  const sessions = useFocusSessions() ?? [];
  const { areaById } = useTaskLookups();
  const color = (t: Task) => (t.areaId ? areaColorVar(areaById.get(t.areaId)?.color) : undefined);
  const cycle = cycles.find((c) => c.id === ritual.cycleId);
  const next = cycle ? cycles.find((c) => c.number === cycle.number + 1) : undefined;
  const data = ritual.data as ReviewData;
  const [reason, setReason] = useState("");
  const [wins, setWins] = useState<string[]>(() => [...(data.wins ?? []), "", "", ""].slice(0, 3));
  const [reflection, setReflection] = useState({
    wentWell: data.wentWell ?? "",
    inTheWay: data.inTheWay ?? "",
    change: data.change ?? "",
  });

  const skips = useLiveQuery(async () => {
    if (!cycle) return 0;
    const list = (await db.taskEvents.toArray()).filter((e) => e.type === "skip");
    return list.filter((e) => {
      const d = dayOf(e.at, settings.timezone);
      return !e.deletedAt && d >= cycle.startDate && d <= cycle.endDate;
    }).length;
  }, [db, cycle?.id, settings.timezone]);

  const stale = useMemo(
    () => buildToday(all, { today: todayDay, now, timezone: settings.timezone, capacity: 0 }).stale,
    [all, now, todayDay, settings.timezone],
  );

  if (!cycle) {
    return (
      <RitualShell
        ritual={ritual}
        onClose={onClose}
        finishLabel="Close"
        onFinish={() => {}}
        steps={[
          {
            id: "missing",
            title: "This cycle is still syncing",
            body: <EmptyStepNote>Try again in a moment.</EmptyStepNote>,
          },
        ]}
      />
    );
  }

  const pts = cyclePoints(all, cycle);
  const unfinished = unfinishedInCycle(all, cycle.id);
  const rate = pts.total ? Math.round((pts.done / pts.total) * 100) : 0;
  const focusMinutes = Math.round(
    sessions
      .filter((s) => {
        const d = dayOf(s.startedAt, settings.timezone);
        return d >= cycle.startDate && d <= cycle.endDate;
      })
      .reduce((sum, s) => sum + s.actualMinutes, 0),
  );
  const strict = settings.strictness !== "gentle";
  const saveReflection = () => void actions.saveRitual(ritual.id, reflection);

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg bg-surface-sunken p-4">
      <p className="text-footnote text-label-secondary">{label}</p>
      <p className="mt-1 text-title2 tabular">{value}</p>
      {sub ? <p className="text-footnote text-label-tertiary">{sub}</p> : null}
    </div>
  );
  const area = (label: string, key: keyof typeof reflection, placeholder: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-headline">{label}</span>
      <textarea
        value={reflection[key]}
        onChange={(e) => setReflection({ ...reflection, [key]: e.target.value })}
        onBlur={saveReflection}
        rows={2}
        maxLength={1000}
        placeholder={placeholder}
        className="field-sizing-content min-h-16 resize-none rounded-lg bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
      />
    </label>
  );

  const steps: RitualStep[] = [
    {
      id: "stats",
      title: `Cycle ${cycle.number} in numbers`,
      hint: pts.committed
        ? `You committed to ${pts.committed} pts and finished ${pts.done}.`
        : "No commitment was made for this cycle.",
      body: (
        <div className="grid grid-cols-2 gap-3">
          {stat("Points done", `${pts.done} / ${pts.total}`, `${rate}% of scope`)}
          {stat("Tasks done", `${pts.doneTasks} / ${pts.tasks}`)}
          {stat("Added mid-cycle", `${pts.added} pts`)}
          {stat(
            "Focus time",
            focusMinutes < 60 ? `${focusMinutes} min` : `${Math.floor(focusMinutes / 60)} h ${focusMinutes % 60} min`,
          )}
          {stat("Skips", String(skips ?? 0), "tasks moved with a reason")}
          {stat("To decide", String(unfinished.length), "unfinished tasks")}
        </div>
      ),
    },
    {
      id: "unfinished",
      title: unfinished.length ? `${unfinished.length} unfinished` : "Everything got done",
      hint: unfinished.length
        ? "Nothing rolls over by itself. Roll it into the next cycle, put it back in the backlog, or cancel it."
        : undefined,
      blockedBy: strict && unfinished.length ? `Decide on ${unfinished.length} more to continue` : null,
      body: unfinished.length ? (
        <div className="flex flex-col gap-3">
          <input
            aria-label="Reason (optional, saved with each decision)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional, saved with each decision)"
            className="h-control rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
          />
          <ul>
            {unfinished.map((t) => (
              <RitualTaskRow
                key={t.id}
                title={t.title}
                areaColor={color(t)}
                sub={t.effort ? `${t.effort} pt${t.effort === 1 ? "" : "s"}` : undefined}
              >
                {next ? (
                  <SmallButton
                    tone="accent"
                    label={`Roll ${t.title} over to cycle ${next.number}`}
                    onClick={() => void actions.decideRollover(t, "rollover", { next, reason })}
                  >
                    Roll over
                  </SmallButton>
                ) : null}
                <SmallButton
                  label={`Move ${t.title} back to the backlog`}
                  onClick={() => void actions.decideRollover(t, "backlog", { reason })}
                >
                  Backlog
                </SmallButton>
                <SmallButton
                  tone="danger"
                  label={`Cancel ${t.title}`}
                  onClick={() => void actions.decideRollover(t, "cancel", { reason })}
                >
                  Cancel
                </SmallButton>
              </RitualTaskRow>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyStepNote>Nothing left over from this cycle.</EmptyStepNote>
      ),
    },
    {
      id: "goals",
      title: "How are your goals doing?",
      hint: goals.length ? "Set the health of each one. Update key results from the goal page if needed." : undefined,
      body: goals.length ? (
        <ul className="flex flex-col gap-3">
          {goals.map((g) => {
            const progress = goalProgress(
              krs.filter((k) => k.goalId === g.id),
              all.filter((t) => t.goalId === g.id),
            );
            return (
              <li key={g.id} className="rounded-lg bg-surface-sunken p-3">
                <p className="flex items-center gap-2 text-headline">
                  <Target className="size-4 text-label-secondary" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{g.title}</span>
                  <span className="text-footnote text-label-secondary tabular">{Math.round(progress * 100)}%</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={`Health of ${g.title}`}>
                  {(Object.keys(HEALTH_META) as GoalHealth[]).map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="radio"
                      aria-checked={g.health === h}
                      onClick={() => void actions.updateGoal(g.id, { health: h })}
                      className={cn(
                        "h-8 rounded-full px-3 text-footnote font-semibold",
                        g.health === h
                          ? h === "on_track"
                            ? "bg-success text-white"
                            : h === "at_risk"
                              ? "bg-warning text-white"
                              : "bg-danger text-white"
                          : "bg-fill hover:bg-fill-strong",
                      )}
                    >
                      {HEALTH_META[h].label}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyStepNote>No active goals right now.</EmptyStepNote>
      ),
    },
    {
      id: "stale",
      title: stale.length ? "Clear out what's gone stale" : "Nothing has gone stale",
      hint: stale.length ? "These keep getting moved or have sat untouched. Keep them, or let them go." : undefined,
      body: stale.length ? (
        <ul>
          {stale.map((t) => (
            <RitualTaskRow key={t.id} title={t.title} areaColor={color(t)}>
              <SmallButton
                label={`Keep ${t.title}`}
                onClick={() => void actions.resolveStale(t, "commit", { to: null })}
              >
                Keep
              </SmallButton>
              <SmallButton tone="danger" label={`Drop ${t.title}`} onClick={() => void actions.resolveStale(t, "drop")}>
                Drop
              </SmallButton>
            </RitualTaskRow>
          ))}
        </ul>
      ) : (
        <EmptyStepNote>Your plan is honest. Nice.</EmptyStepNote>
      ),
    },
    {
      id: "wins",
      title: "Wins worth remembering",
      hint: "Big or small. Up to three.",
      body: (
        <div className="flex flex-col gap-2">
          {wins.map((w, i) => (
            <input
              key={i}
              aria-label={`Win ${i + 1}`}
              value={w}
              onChange={(e) => setWins(wins.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => void actions.saveRitual(ritual.id, { wins: wins.map((x) => x.trim()).filter(Boolean) })}
              placeholder={i === 0 ? "e.g. Sent my CV to 5 companies" : "Another win"}
              className="h-control rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
            />
          ))}
        </div>
      ),
    },
    {
      id: "reflect",
      title: "Look back",
      body: (
        <div className="flex flex-col gap-4">
          {area("What went well?", "wentWell", "e.g. Mornings were productive")}
          {area("What got in the way?", "inTheWay", "e.g. Said yes to too much")}
          {area("What will you change next cycle?", "change", "e.g. Fewer tasks, one focus goal")}
        </div>
      ),
    },
    {
      id: "next",
      title: next ? `Plan cycle ${next.number}` : "Next cycle",
      hint: next ? "Pull in what you'll do, check it fits, and commit." : undefined,
      body: next ? (
        <CyclePlanner cycle={next} skipGate />
      ) : (
        <EmptyStepNote>The next cycle is being set up. You can plan it from the Cycle page.</EmptyStepNote>
      ),
    },
  ];

  return (
    <RitualShell
      ritual={ritual}
      steps={steps}
      onClose={onClose}
      finishLabel="Finish the review"
      onFinish={async () => {
        const text = [
          reflection.wentWell && `Went well: ${reflection.wentWell.trim()}`,
          reflection.inTheWay && `In the way: ${reflection.inTheWay.trim()}`,
          reflection.change && `Change: ${reflection.change.trim()}`,
        ]
          .filter(Boolean)
          .join("\n");
        await actions.completeReview(cycle, text || null);
        await actions.completeRitual(ritual.id, {
          ...reflection,
          wins: wins.map((x) => x.trim()).filter(Boolean),
          points: pts,
        });
      }}
    />
  );
}
