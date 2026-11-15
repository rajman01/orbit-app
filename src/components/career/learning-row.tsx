"use client";

import { BookOpen, Check, FileText, GraduationCap, Headphones, Play, PlayCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { useActions } from "@/features/actions";
import { LEARNING_KIND_LABEL, type LearningItem, type LearningKind } from "@/features/career/model";
import { useSkills } from "@/features/data";
import { cn } from "@/lib/cn";
import { LearningDialog } from "./forms";

export const KIND_ICON: Record<LearningKind, typeof BookOpen> = {
  book: BookOpen,
  course: GraduationCap,
  article: FileText,
  video: PlayCircle,
  podcast: Headphones,
  other: Sparkles,
};

/** CAR-3: one thing to learn from. Tap to edit; Start and Done are one click. */
export function LearningRow({ item, showSkill = true }: { item: LearningItem; showSkill?: boolean }) {
  const actions = useActions();
  const skills = useSkills({ includeArchived: true }) ?? [];
  const [editing, setEditing] = useState(false);
  const Icon = KIND_ICON[item.kind];
  const skill = showSkill && item.skillId ? skills.find((s) => s.id === item.skillId) : undefined;
  const done = item.status === "done";
  return (
    <li className="group flex min-h-row items-center gap-2 rounded-md pr-1 hover:bg-fill">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${item.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
      >
        <Icon
          className="size-4 shrink-0 text-label-secondary"
          strokeWidth={1.75}
          aria-label={LEARNING_KIND_LABEL[item.kind]}
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-body", done && "text-label-secondary")}>{item.title}</span>
          <span className="block truncate text-footnote text-label-secondary">
            {[item.author, skill?.name].filter(Boolean).join(" · ") || LEARNING_KIND_LABEL[item.kind]}
          </span>
          {item.status === "in_progress" ? (
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1.5 max-w-48 flex-1 overflow-hidden rounded-full bg-fill">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${item.progress}%` }} />
              </span>
              <span className="text-caption text-label-tertiary tabular">{item.progress}%</span>
            </span>
          ) : null}
        </span>
      </button>
      {item.status === "queued" ? (
        <button
          type="button"
          onClick={() => void actions.updateLearningItem(item, { status: "in_progress" })}
          aria-label={`Start ${item.title}`}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text hover:brightness-95"
        >
          <Play className="size-3.5" fill="currentColor" /> Start
        </button>
      ) : item.status === "in_progress" ? (
        <button
          type="button"
          onClick={() => void actions.updateLearningItem(item, { status: "done" })}
          aria-label={`Finish ${item.title}`}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text hover:brightness-95"
        >
          <Check className="size-3.5" strokeWidth={2.5} /> Done
        </button>
      ) : null}
      {editing ? <LearningDialog open onOpenChange={(o) => !o && setEditing(false)} item={item} /> : null}
    </li>
  );
}
