"use client";

import { Plus, Target } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { AreaIcon } from "@/components/areas/area-icon";
import { GoalCard } from "@/components/goals/goal-card";
import { NewGoalDialog } from "@/components/goals/goal-form";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useAllTasks, useAreas, useGoals, useKeyResults, useSettings } from "@/features/data";
import { goalProgress, needsNextStep, suggestHealth, type Goal } from "@/features/goals/model";
import { compareTasks, isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { dayOf } from "@/lib/dates";

type Tab = "active" | "completed" | "dropped";

export function GoalsView() {
  const router = useRouter();
  const startNew = useSearchParams().get("new") === "1";
  const goals = useGoals();
  const areas = useAreas({ includeArchived: true }) ?? [];
  const tasks = useAllTasks() ?? [];
  const krs = useKeyResults() ?? [];
  const todayDay = useToday();
  const { timezone } = useSettings();
  const [tab, setTab] = useState<Tab>("active");
  const [creating, setCreating] = useState(startNew);

  const inTab = (g: Goal) => (tab === "active" ? ["active", "planned", "paused"].includes(g.status) : g.status === tab);
  const shown = (goals ?? []).filter(inTab);
  const groups = [
    ...areas.map((a) => ({ area: a, goals: shown.filter((g) => g.areaId === a.id) })),
    { area: undefined, goals: shown.filter((g) => !g.areaId || !areas.some((a) => a.id === g.areaId)) },
  ].filter((g) => g.goals.length);

  const card = (g: Goal) => {
    const gt = tasks.filter((t) => t.goalId === g.id);
    const progress = goalProgress(
      krs.filter((k) => k.goalId === g.id),
      gt,
    );
    return (
      <GoalCard
        key={g.id}
        goal={g}
        area={areas.find((a) => a.id === g.areaId)}
        progress={progress}
        health={g.health ?? suggestHealth(g, progress, todayDay, dayOf(g.createdAt, timezone))}
        nextTask={gt.filter((t) => isOpen(t) && !t.parentTaskId).sort(compareTasks)[0]}
        needsNextStep={needsNextStep(g, gt)}
        todayDay={todayDay}
      />
    );
  };

  return (
    <>
      <PageHeader
        title="Goals"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New goal
          </Button>
        }
      />
      <PageBody>
        <div className="mb-5">
          <Segmented
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
              { value: "dropped", label: "Dropped" },
            ]}
          />
        </div>
        {goals && !shown.length ? (
          <EmptyState
            icon={Target}
            title={tab === "active" ? "No active goals" : `No ${tab} goals`}
            body={
              tab === "active"
                ? "Turn something you've been meaning to do into a goal with a first step."
                : "They'll show up here."
            }
            action={tab === "active" ? <Button onClick={() => setCreating(true)}>Add a goal</Button> : undefined}
          />
        ) : (
          groups.map(({ area, goals: gs }) => (
            <section key={area?.id ?? "none"} className="mb-6">
              <h2 className="mb-2 flex items-center gap-2 px-1 text-micro text-label-secondary uppercase">
                {area ? <AreaIcon icon={area.icon} color={area.color} className="size-3.5" /> : null}
                {area?.name ?? "No area"}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">{gs.map(card)}</div>
            </section>
          ))
        )}
      </PageBody>
      <NewGoalDialog
        open={creating}
        onOpenChange={(o) => {
          setCreating(o);
          if (!o && startNew) router.replace("/goals");
        }}
      />
    </>
  );
}
