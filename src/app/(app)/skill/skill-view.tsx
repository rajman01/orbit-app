"use client";

import { Archive, ArchiveRestore, BookOpen, GraduationCap, Pencil, Plus, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { useCommands } from "@/components/app/commands";
import { EmptyState } from "@/components/app/empty-state";
import { LearningRow } from "@/components/career/learning-row";
import { LearningDialog, SkillDialog } from "@/components/career/forms";
import { LevelDots } from "@/components/career/level-dots";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useActions } from "@/features/actions";
import { SKILL_LEVELS, type Skill } from "@/features/career/model";
import { useAllTasks, useGoals, useLearningItems, useSkill, useSkills } from "@/features/data";
import { isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { dayLabel } from "@/lib/dates";

/** CAR-2: one skill — its level, evidence, what you're learning from and practising. */
export function SkillView() {
  const id = useSearchParams().get("id");
  const skill = useSkill(id);
  if (skill === undefined) return null;
  if (!skill)
    return (
      <EmptyState icon={GraduationCap} title="Skill not found" body="It may have been deleted on another device." />
    );
  return <SkillPage key={skill.id} skill={skill} />;
}

function SkillPage({ skill }: { skill: Skill }) {
  const actions = useActions();
  const router = useRouter();
  const today = useToday();
  const { openQuickAdd } = useCommands();
  const all = useSkills({ includeArchived: true }) ?? [];
  const goals = useGoals() ?? [];
  const learning = (useLearningItems() ?? []).filter((l) => l.skillId === skill.id);
  const tasks = (useAllTasks() ?? []).filter((t) => t.skillId === skill.id && !t.parentTaskId);
  const [evidence, setEvidence] = useState(skill.evidence);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const goal = goals.find((g) => g.id === skill.goalId);
  const categories = [...new Set(all.map((s) => s.category).filter(Boolean))].sort();
  const open = tasks.filter(isOpen);
  const done = tasks.filter((t) => t.status === "done");
  const activeLearning = learning.filter((l) => l.status === "in_progress" || l.status === "queued");
  const finished = learning.filter((l) => l.status === "done");

  return (
    <>
      <PageHeader
        subtitle={
          <Link href="/skills" className="flex items-center gap-1.5 hover:underline">
            <GraduationCap className="size-3.5" /> {skill.category || "Skills"}
          </Link>
        }
        title={skill.name}
        actions={
          <>
            <IconButton label="Edit skill" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} />
            <IconButton
              label={skill.archivedAt ? "Restore skill" : "Archive skill"}
              icon={skill.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              onClick={() => void actions.archiveSkill(skill.id, !skill.archivedAt)}
            />
            <IconButton label="Delete skill" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)} />
          </>
        }
      />
      <PageBody className="max-w-[720px]">
        <section aria-label="Level" className="mb-6 rounded-xl bg-surface p-4 shadow-1 dark:bg-surface-raised">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-headline">
                {SKILL_LEVELS[skill.level].label}
                <span className="font-normal text-label-secondary"> · {SKILL_LEVELS[skill.level].hint}</span>
              </p>
              <p className="text-footnote text-label-secondary">
                {skill.level >= skill.targetLevel
                  ? "Target reached. Raise it when you're ready."
                  : `Aiming for ${SKILL_LEVELS[skill.targetLevel].label}${skill.targetDate ? ` by ${dayLabel(skill.targetDate, today).toLowerCase()}` : ""}.`}
                {goal ? (
                  <>
                    {" "}
                    For{" "}
                    <Link href={`/goal?id=${goal.id}`} className="font-medium text-accent-text">
                      <Target className="mr-0.5 inline size-3.5" />
                      {goal.title}
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            </div>
            <LevelDots
              level={skill.level}
              target={skill.targetLevel}
              name={skill.name}
              size="lg"
              onChange={(level) => void actions.updateSkill(skill, { level })}
            />
          </div>
        </section>

        <SectionLabel count={activeLearning.length}>Learning from</SectionLabel>
        {activeLearning.length ? (
          <ul className="flex flex-col">
            {activeLearning.map((l) => (
              <LearningRow key={l.id} item={l} showSkill={false} />
            ))}
          </ul>
        ) : (
          <p className="px-2 py-1 text-callout text-label-secondary">Nothing yet: add a book, course or article.</p>
        )}
        <Button variant="ghost" icon={<BookOpen className="size-4" />} onClick={() => setAdding(true)}>
          Add something to learn from
        </Button>
        {finished.length ? (
          <p className="mt-1 px-2 text-footnote text-label-tertiary">
            Finished: {finished.map((l) => l.title).join(", ")}
          </p>
        ) : null}

        <SectionLabel count={open.length}>Practice</SectionLabel>
        {open.length ? <TaskList tasks={open} /> : null}
        <Button
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() =>
            openQuickAdd({ skillId: skill.id, areaId: skill.areaId, goalId: skill.goalId, status: "todo" })
          }
        >
          Add a practice task
        </Button>
        {done.length ? (
          <p className="mt-1 px-2 text-footnote text-label-tertiary">
            {done.length} practice task{done.length === 1 ? "" : "s"} done
          </p>
        ) : null}

        <SectionLabel>Evidence</SectionLabel>
        <textarea
          aria-label="Evidence"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          onBlur={() => evidence !== skill.evidence && void actions.updateSkill(skill, { evidence })}
          placeholder="What shows your level: projects shipped, feedback, certificates, talks…"
          className="field-sizing-content min-h-28 w-full resize-none rounded-lg bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
        />
      </PageBody>
      {editing ? (
        <SkillDialog open onOpenChange={(o) => !o && setEditing(false)} skill={skill} categories={categories} />
      ) : null}
      {adding ? <LearningDialog open onOpenChange={(o) => !o && setAdding(false)} skillId={skill.id} /> : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${skill.name}”?`}
        description="Its learning items and tasks stay, without the link. To keep its history, archive it instead."
        confirmLabel="Delete skill"
        onConfirm={() => {
          void actions.deleteSkill(skill.id);
          router.replace("/skills");
        }}
      />
    </>
  );
}
