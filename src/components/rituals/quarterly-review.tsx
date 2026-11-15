"use client";

import { Target } from "lucide-react";
import { useState } from "react";
import { Pill } from "@/components/ui/pill";
import { useActions } from "@/features/actions";
import { useAreaRatings, useAreas, useKeyResults, useQuarters, type RitualDoc } from "@/features/data";
import { useToday } from "@/features/use-today";
import { WheelRatingForm } from "@/components/insights/wheel-rating";
import { krProgress } from "@/features/goals/model";
import { addQuarters, quarterId, quarterLabel, quarterOf } from "@/features/quarters/model";
import { useQuarter } from "@/features/quarters/use-quarter";
import { useCurrentUser } from "@/components/app/auth-gate";
import { cn } from "@/lib/cn";
import { EmptyStepNote, RitualShell, SmallButton, useRitualLauncher, type RitualStep } from "./ritual-flow";

type Decision = "completed" | "carry" | "drop";
type ReviewData = {
  decisions?: Record<string, Decision>;
  dropReasons?: Record<string, string>;
  wins?: string[];
  reflection?: string;
};

const textarea =
  "field-sizing-content min-h-24 w-full resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent";

/**
 * QTR-4 / RIT-7: the Quarterly Review. Results per goal → a decision on each unfinished goal
 * (completed / carry into next quarter / drop with a reason) → wins → reflection → Wheel of Life
 * (AREA-4) → plan the next.
 */
export function QuarterlyReviewFlow({ ritual, onClose }: { ritual: RitualDoc; onClose: () => void }) {
  const actions = useActions();
  const user = useCurrentUser();
  const today = useToday();
  const launcher = useRitualLauncher();
  const ref = quarterOf(ritual.date);
  const nextRef = addQuarters(ref, 1);
  const quarter = useQuarter(ref);
  const quarters = useQuarters() ?? [];
  const krs = useKeyResults() ?? [];
  const areas = useAreas() ?? [];
  const ratings = useAreaRatings() ?? [];
  const ratedToday = ratings[0]?.date === today;
  const label = quarterLabel(ref);
  const nextLabel = quarterLabel(nextRef);
  const data = ritual.data as ReviewData;
  const [decisions, setDecisions] = useState<Record<string, Decision>>(data.decisions ?? {});
  const [reasons, setReasons] = useState<Record<string, string>>(data.dropReasons ?? {});
  const [wins, setWins] = useState<string[]>(() => [...(data.wins ?? []), "", "", ""].slice(0, 3));
  const [reflection, setReflection] = useState(data.reflection ?? "");

  const items = quarter?.items ?? [];
  const nextDoc = quarters.find((q) => q.id === quarterId(user.id, nextRef));
  // Goals still open when the review started need a decision; ones decided here stay listed.
  const toDecide = items.filter(
    (i) => decisions[i.goal.id] || (i.goal.status !== "completed" && i.goal.status !== "dropped"),
  );
  const undecided = toDecide.filter(
    (i) => !decisions[i.goal.id] || (decisions[i.goal.id] === "drop" && !reasons[i.goal.id]?.trim()),
  );

  const save = (patch: Partial<ReviewData>) => void actions.saveRitual(ritual.id, patch);

  async function decide(goalId: string, d: Decision) {
    const before = decisions[goalId];
    if (before === d) return;
    // Take back the previous choice first.
    if (before === "completed" || before === "drop") await actions.reopenGoal(goalId);
    if (before === "carry")
      await actions.setQuarterGoals(
        nextRef,
        (nextDoc?.goalIds ?? []).filter((g) => g !== goalId),
      );
    if (d === "completed") await actions.completeGoal(goalId);
    if (d === "carry") await actions.setQuarterGoals(nextRef, [...(nextDoc?.goalIds ?? []), goalId]);
    if (d === "drop" && reasons[goalId]?.trim()) await actions.dropGoal(goalId, reasons[goalId].trim());
    const next = { ...decisions, [goalId]: d };
    setDecisions(next);
    save({ decisions: next });
  }

  const steps: RitualStep[] = [
    {
      id: "results",
      title: `How did ${label} go?`,
      hint: quarter
        ? `${Math.round(quarter.progress * 100)}% average progress across ${items.length} goal${items.length === 1 ? "" : "s"}.`
        : undefined,
      body: items.length ? (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.goal.id} className="rounded-lg bg-surface-sunken p-3">
              <p className="flex items-center gap-2 text-headline">
                <Target className="size-4 shrink-0 text-label-secondary" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">{i.goal.title}</span>
                <span className="text-footnote text-label-secondary tabular">{Math.round(i.progress * 100)}%</span>
                {i.goal.status === "completed" ? <Pill tone="success">Done</Pill> : null}
              </p>
              {krs.filter((k) => k.goalId === i.goal.id).length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {krs
                    .filter((k) => k.goalId === i.goal.id)
                    .map((k) => (
                      <li key={k.id} className="flex items-center gap-2 text-footnote">
                        <span className="min-w-0 flex-1 truncate">{k.title}</span>
                        <span className="text-label-secondary tabular">
                          {k.current} / {k.target}
                          {k.unit ? ` ${k.unit}` : ""} · {Math.round(krProgress(k) * 100)}%
                        </span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyStepNote>No goals were committed for {label}.</EmptyStepNote>
      ),
    },
    {
      id: "decide",
      title: "Decide on each unfinished goal",
      hint: `Done after all, carry into ${nextLabel}, or drop it with a reason.`,
      blockedBy: undecided.length ? `Decide on ${undecided.length} more to continue` : null,
      body: toDecide.length ? (
        <ul className="flex flex-col gap-3">
          {toDecide.map((i) => {
            const d = decisions[i.goal.id];
            return (
              <li key={i.goal.id} className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-3">
                <p className="text-headline">{i.goal.title}</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Decision for ${i.goal.title}`}>
                  {(
                    [
                      ["completed", "Done"],
                      ["carry", `Carry into ${nextLabel}`],
                      ["drop", "Drop"],
                    ] as const
                  ).map(([k, text]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={d === k}
                      onClick={() => void decide(i.goal.id, k)}
                      className={cn(
                        "h-8 rounded-full px-3 text-footnote font-semibold",
                        d === k ? "bg-accent text-on-accent" : "bg-fill hover:bg-fill-strong",
                      )}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {d === "drop" ? (
                  <input
                    aria-label={`Why drop ${i.goal.title}`}
                    value={reasons[i.goal.id] ?? ""}
                    onChange={(e) => setReasons({ ...reasons, [i.goal.id]: e.target.value })}
                    onBlur={() => {
                      const r = reasons[i.goal.id]?.trim();
                      if (!r) return;
                      save({ dropReasons: reasons });
                      void actions.dropGoal(i.goal.id, r);
                    }}
                    placeholder="Why? e.g. No longer matters, priorities changed"
                    className="h-control rounded-md bg-surface px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyStepNote>Every goal is done. Well played.</EmptyStepNote>
      ),
    },
    {
      id: "wins",
      title: "Your wins this quarter",
      hint: "Up to three things you're proud of, big or small.",
      body: (
        <div className="flex flex-col gap-2">
          {wins.map((w, i) => (
            <input
              key={i}
              aria-label={`Win ${i + 1}`}
              value={w}
              onChange={(e) => setWins(wins.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => save({ wins: wins.filter((x) => x.trim()) })}
              placeholder={i === 0 ? "e.g. Shipped the portfolio" : "Another win"}
              className="h-control rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
            />
          ))}
        </div>
      ),
    },
    {
      id: "reflect",
      title: "Look back",
      hint: "What went well, what got in the way, and what you'll do differently.",
      body: (
        <textarea
          aria-label="Reflection"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          onBlur={() => save({ reflection })}
          placeholder="Write freely. It's kept with the quarter."
          className={textarea}
        />
      ),
    },
    {
      id: "wheel",
      title: "Your Wheel of Life",
      hint: "How is each area going, and how much does it matter now? It starts from last time; move what changed.",
      body: areas.length ? (
        ratedToday ? (
          <p className="text-callout">Saved for today. You can change it from Insights.</p>
        ) : (
          <WheelRatingForm areas={areas} last={ratings[0]} submitLabel="Save rating" />
        )
      ) : (
        <EmptyStepNote>Add areas first to rate them.</EmptyStepNote>
      ),
    },
    {
      id: "next",
      title: `On to ${nextLabel}`,
      hint: "Finishing the review opens the Quarterly Plan for the next quarter.",
      body: (
        <div className="flex flex-col gap-2">
          {Object.entries(decisions).filter(([, d]) => d === "carry").length ? (
            <p className="text-callout">
              Carried into {nextLabel}:{" "}
              {toDecide
                .filter((i) => decisions[i.goal.id] === "carry")
                .map((i) => i.goal.title)
                .join(", ")}
              .
            </p>
          ) : (
            <p className="text-callout text-label-secondary">Nothing carried over: a clean start.</p>
          )}
          <SmallButton onClick={onClose}>Plan it later</SmallButton>
        </div>
      ),
    },
  ];

  return (
    <RitualShell
      ritual={ritual}
      steps={steps}
      onClose={onClose}
      finishLabel={`Finish and plan ${nextLabel}`}
      onFinish={async () => {
        const w = wins.map((x) => x.trim()).filter(Boolean);
        await actions.completeQuarterReview(ref, reflection);
        await actions.completeRitual(ritual.id, { decisions, dropReasons: reasons, wins: w, reflection });
        // The review leads straight into the next quarter's plan (QTR-4).
        const next = addQuarters(ref, 1);
        setTimeout(
          () =>
            void launcher.open("quarterly_plan", {
              date: `${next.year}-${String((next.q - 1) * 3 + 1).padStart(2, "0")}-01`,
              quarter: next,
            }),
          350,
        );
      }}
    />
  );
}
