"use client";

import { Pencil, Plus, Target } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { useCommands } from "@/components/app/commands";
import { EmptyState } from "@/components/app/empty-state";
import { AreaDialog } from "@/components/areas/area-form";
import { AreaIcon } from "@/components/areas/area-icon";
import { GoalCard } from "@/components/goals/goal-card";
import { NewGoalDialog } from "@/components/goals/goal-form";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { useAllTasks, useArea, useGoals, useKeyResults, useSettings } from "@/features/data";
import { goalProgress, needsNextStep, suggestHealth } from "@/features/goals/model";
import { isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { dayOf } from "@/lib/dates";

/** Area overview (PRD AREA-2): goals with progress, open tasks. */
export function AreaView() {
  const id = useSearchParams().get("id");
  const area = useArea(id);
  const goals = (useGoals() ?? []).filter((g) => g.areaId === id);
  const allTasks = useAllTasks() ?? [];
  const tasks = allTasks.filter((t) => t.areaId === id && !t.parentTaskId);
  const krs = useKeyResults() ?? [];
  const todayDay = useToday();
  const { timezone } = useSettings();
  const { openQuickAdd } = useCommands();
  const [editing, setEditing] = useState(false);
  const [newGoal, setNewGoal] = useState(false);

  if (area === undefined) return null;
  if (!area)
    return <EmptyState icon={Target} title="Area not found" body="It may have been deleted on another device." />;

  const activeGoals = goals.filter((g) => g.status === "active" || g.status === "planned" || g.status === "paused");
  const openTasks = tasks.filter(isOpen);

  return (
    <>
      <PageHeader
        subtitle={
          <span className="flex items-center gap-1.5">
            <AreaIcon icon={area.icon} color={area.color} className="size-3.5" /> Area
          </span>
        }
        title={area.name}
        actions={
          <>
            <IconButton label="Edit area" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} />
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setNewGoal(true)}>
              Goal
            </Button>
          </>
        }
      />
      <PageBody>
        {area.description ? (
          <p className="-mt-2 mb-6 max-w-[68ch] text-callout text-label-secondary">{area.description}</p>
        ) : null}
        <SectionLabel count={activeGoals.length}>Goals</SectionLabel>
        {activeGoals.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {activeGoals.map((g) => {
              const gt = allTasks.filter((t) => t.goalId === g.id);
              const progress = goalProgress(
                krs.filter((k) => k.goalId === g.id),
                gt,
              );
              return (
                <GoalCard
                  key={g.id}
                  goal={g}
                  area={area}
                  progress={progress}
                  health={g.health ?? suggestHealth(g, progress, todayDay, dayOf(g.createdAt, timezone))}
                  nextTask={gt.filter(isOpen)[0]}
                  needsNextStep={needsNextStep(g, gt)}
                  todayDay={todayDay}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Target}
            title={`No goals in ${area.name} yet`}
            body="What would make this part of your life better a year from now?"
            action={<Button onClick={() => setNewGoal(true)}>Add a goal</Button>}
          />
        )}
        <SectionLabel count={openTasks.length}>Open tasks</SectionLabel>
        <TaskList tasks={openTasks} label={`Open tasks in ${area.name}`} />
        <button
          type="button"
          onClick={() => openQuickAdd({ areaId: area.id })}
          className="mt-1 flex h-row w-full items-center gap-2 rounded-md px-3 text-body text-label-tertiary hover:bg-fill"
        >
          <Plus className="size-4" /> Add a task
        </button>
      </PageBody>
      {editing ? <AreaDialog open onOpenChange={setEditing} area={area} /> : null}
      <NewGoalDialog open={newGoal} onOpenChange={setNewGoal} areaId={area.id} />
    </>
  );
}
