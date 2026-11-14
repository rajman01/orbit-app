"use client";

import { Flag, Gauge, Sparkles, Target, X } from "lucide-react";
import { useState } from "react";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useSync } from "@/components/app/sync-provider";
import { useToast } from "@/components/ui/toast";
import type { COACH_TOOLS } from "@/features/coach/tools";
import { acceptProposal, dismissProposal } from "@/features/coach/write-tools";
import { useGoal } from "@/features/data";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/dates";
import type { AiAction } from "./action-card";

type Plan = import("zod").infer<(typeof COACH_TOOLS)["propose_plan"]["input"]>;
type PlanTask = NonNullable<Plan["tasks"]>[number];

/**
 * PRD §10.6 / AI-2: a proposed plan as an editable preview (goal → key results → milestones →
 * tasks). Rename or remove anything, then apply it all at once; one Undo takes it all back.
 */
export function PlanCard({ action }: { action: AiAction }) {
  const engine = useSync();
  const user = useCurrentUser();
  const toast = useToast();
  const [plan, setPlan] = useState<Plan>(() => structuredClone(action.input) as Plan);
  const [working, setWorking] = useState(false);
  const existing = useGoal(plan.goalId ?? undefined);

  const apply = async () => {
    setWorking(true);
    try {
      await acceptProposal(action.id, { engine, db: engine.db, userId: user.id, now: Date.now() }, plan);
      toast({ message: "Plan added" });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : "Couldn't apply the plan." });
    } finally {
      setWorking(false);
    }
  };

  const setTask = (where: { milestone?: number; index: number }, patch: Partial<PlanTask> | null) =>
    setPlan((p) => {
      const next = structuredClone(p);
      const list = where.milestone === undefined ? next.tasks! : next.milestones![where.milestone].tasks!;
      if (patch === null) list.splice(where.index, 1);
      else list[where.index] = { ...list[where.index], ...patch };
      return next;
    });

  const total = (plan.tasks?.length ?? 0) + (plan.milestones ?? []).reduce((n, m) => n + (m.tasks?.length ?? 0), 0);

  return (
    <section
      aria-label="Proposed plan"
      data-ai-action="proposed"
      className="flex flex-col gap-3 rounded-xl border border-separator bg-[color-mix(in_srgb,var(--info)_6%,var(--surface))] p-3"
    >
      <header className="flex items-center gap-2 text-footnote font-semibold text-label-secondary">
        <Sparkles className="size-3.5 text-accent" aria-hidden /> Proposed plan · edit anything, then apply
      </header>

      <div className="flex items-start gap-2">
        <Target className="mt-1.5 size-4 shrink-0 text-accent" aria-hidden />
        {plan.goal ? (
          <Field
            label="Goal"
            value={plan.goal.title}
            onChange={(v) => setPlan((p) => ({ ...p, goal: { ...p.goal!, title: v } }))}
            className="text-headline"
          />
        ) : (
          <p className="py-1 text-headline">
            <span className="text-label-secondary">Adds to </span>
            {existing?.title ?? "your goal"}
          </p>
        )}
      </div>
      {plan.goal?.targetDate ? (
        <p className="-mt-2 pl-6 text-footnote text-label-secondary">
          By <DateText day={plan.goal.targetDate} />
        </p>
      ) : null}

      {plan.keyResults?.length ? (
        <ul className="flex flex-col gap-1 pl-6" aria-label="Key results">
          {plan.keyResults.map((kr, i) => (
            <li key={i} className="flex items-center gap-2">
              <Gauge className="size-3.5 shrink-0 text-label-tertiary" aria-hidden />
              <Field
                label="Key result"
                value={kr.title}
                onChange={(v) =>
                  setPlan((p) => {
                    const next = structuredClone(p);
                    next.keyResults![i].title = v;
                    return next;
                  })
                }
              />
              <span className="shrink-0 text-footnote text-label-tertiary tabular">
                {kr.type === "boolean"
                  ? "yes/no"
                  : `→ ${kr.target}${kr.type === "percent" ? "%" : kr.unit ? ` ${kr.unit}` : ""}`}
              </span>
              <Remove
                label={`Remove key result ${kr.title}`}
                onClick={() => setPlan((p) => ({ ...p, keyResults: p.keyResults!.filter((_, j) => j !== i) }))}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {(plan.milestones ?? []).map((m, mi) => (
        <div key={mi} className="flex flex-col gap-1 pl-6">
          <div className="flex items-center gap-2">
            <Flag className="size-3.5 shrink-0 text-label-secondary" aria-hidden />
            <Field
              label="Milestone"
              value={m.title}
              className="font-semibold"
              onChange={(v) =>
                setPlan((p) => {
                  const next = structuredClone(p);
                  next.milestones![mi].title = v;
                  return next;
                })
              }
            />
            {m.dueDate ? (
              <span className="shrink-0 text-footnote text-label-tertiary">
                <DateText day={m.dueDate} />
              </span>
            ) : null}
            <Remove
              label={`Remove milestone ${m.title}`}
              onClick={() => setPlan((p) => ({ ...p, milestones: p.milestones!.filter((_, j) => j !== mi) }))}
            />
          </div>
          <TaskList tasks={m.tasks ?? []} onChange={(index, patch) => setTask({ milestone: mi, index }, patch)} />
        </div>
      ))}

      {plan.tasks?.length ? (
        <div className="flex flex-col gap-1 pl-6">
          <p className="text-footnote text-label-secondary">Other tasks</p>
          <TaskList tasks={plan.tasks} onChange={(index, patch) => setTask({ index }, patch)} />
        </div>
      ) : null}

      <footer className="flex items-center justify-between gap-2 border-t border-separator pt-2.5">
        <span className="text-footnote text-label-secondary">
          {plan.milestones?.length ?? 0} milestones · {total} tasks
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            disabled={working}
            onClick={() => void dismissProposal(engine, action.id)}
            className="h-8 rounded-full px-3 text-footnote font-semibold text-label-secondary hover:bg-fill"
          >
            Dismiss
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void apply()}
            className="h-8 rounded-full bg-accent px-3.5 text-footnote font-semibold text-on-accent hover:brightness-95 disabled:opacity-40"
          >
            Apply plan
          </button>
        </span>
      </footer>
    </section>
  );
}

function TaskList({
  tasks,
  onChange,
}: {
  tasks: PlanTask[];
  onChange: (index: number, patch: Partial<PlanTask> | null) => void;
}) {
  if (!tasks.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 pl-5" aria-label="Tasks">
      {tasks.map((t, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="size-3 shrink-0 rounded-full border-[1.5px] border-label-tertiary" aria-hidden />
          <Field label="Task" value={t.title} onChange={(v) => onChange(i, { title: v })} />
          {t.effort ? (
            <span className="shrink-0 text-caption text-label-tertiary tabular">
              {t.effort} {t.effort === 1 ? "pt" : "pts"}
            </span>
          ) : null}
          <Remove label={`Remove task ${t.title}`} onClick={() => onChange(i, null)} />
        </li>
      ))}
    </ul>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <input
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-callout outline-none hover:bg-fill focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    />
  );
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded-full text-label-tertiary hover:bg-fill hover:text-label"
    >
      <X className="size-3.5" />
    </button>
  );
}

function DateText({ day }: { day: string }) {
  return <>{dayLabel(day, useToday())}</>;
}
