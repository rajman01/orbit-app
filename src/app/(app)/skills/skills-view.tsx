"use client";

import { GraduationCap, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { SkillDialog } from "@/components/career/forms";
import { LevelDots } from "@/components/career/level-dots";
import { SectionLabel } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { skillsByCategory, SKILL_LEVELS } from "@/features/career/model";
import { useAllTasks, useLearningItems, useSkills } from "@/features/data";
import { isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { dayLabel } from "@/lib/dates";

/** CAR-2: skills by category, with level now and level aimed for. */
export function SkillsView() {
  const skills = useSkills({ includeArchived: true });
  const learning = useLearningItems() ?? [];
  const tasks = useAllTasks() ?? [];
  const today = useToday();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const active = (skills ?? []).filter((s) => !s.archivedAt);
  const archived = (skills ?? []).filter((s) => s.archivedAt);
  const categories = [...new Set((skills ?? []).map((s) => s.category).filter(Boolean))].sort();

  const row = (s: (typeof active)[number]) => {
    const reading = learning.filter((l) => l.skillId === s.id && (l.status === "in_progress" || l.status === "queued"));
    const practice = tasks.filter((t) => t.skillId === s.id && isOpen(t) && !t.parentTaskId).length;
    const reached = s.level >= s.targetLevel;
    return (
      <li key={s.id}>
        <Link
          href={`/skill?id=${s.id}`}
          className="flex min-h-row items-center gap-3 rounded-md px-2 py-2 hover:bg-fill"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body">{s.name}</span>
            <span className="block truncate text-footnote text-label-secondary">
              {SKILL_LEVELS[s.level].label}
              {reached
                ? " · target reached"
                : ` → ${SKILL_LEVELS[s.targetLevel].label}${s.targetDate ? ` by ${dayLabel(s.targetDate, today).toLowerCase()}` : ""}`}
              {reading.length ? ` · ${reading.length} to learn from` : ""}
              {practice ? ` · ${practice} task${practice === 1 ? "" : "s"}` : ""}
            </span>
          </span>
          <LevelDots level={s.level} target={s.targetLevel} />
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="Skills"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
            New skill
          </Button>
        }
      />
      <PageBody className="max-w-[720px]">
        {skills && !active.length ? (
          <EmptyState
            icon={GraduationCap}
            title="No skills yet"
            body="Add the skills you're growing, where you are now and where you want to be. Link books, courses and tasks to them."
            action={
              <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Add a skill
              </Button>
            }
          />
        ) : null}
        {skillsByCategory(active).map((g) => (
          <section key={g.category || "none"}>
            <SectionLabel count={g.items.length}>{g.category || "Other"}</SectionLabel>
            <ul className="flex flex-col">{g.items.map(row)}</ul>
          </section>
        ))}
        {archived.length ? (
          <div className="mt-6">
            <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Hide" : "Show"} archived ({archived.length})
            </Button>
            {showArchived ? <ul className="flex flex-col opacity-70">{archived.map(row)}</ul> : null}
          </div>
        ) : null}
        <p className="mt-8 px-2 text-footnote text-label-tertiary">
          Levels:{" "}
          {[1, 2, 3, 4, 5]
            .map((n) => `${n} ${SKILL_LEVELS[n].label} (${SKILL_LEVELS[n].hint.toLowerCase()})`)
            .join(" · ")}
          . Each level gained earns XP.
        </p>
      </PageBody>
      {adding ? (
        <SkillDialog
          open
          onOpenChange={(o) => !o && setAdding(false)}
          categories={categories}
          onSaved={(id) => router.push(`/skill?id=${id}`)}
        />
      ) : null}
    </>
  );
}
