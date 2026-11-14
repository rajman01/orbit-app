"use client";

import { Heart, Plus, X } from "lucide-react";
import Link from "next/link";
import { SectionLabel } from "@/components/tasks/task-list";
import { Picker } from "@/components/ui/picker";
import { useActions } from "@/features/actions";
import { useVision } from "@/features/data";
import type { Goal } from "@/features/goals/model";

/** VIS-2: the values a goal serves — "why this matters". */
export function GoalValues({ goal }: { goal: Goal }) {
  const actions = useActions();
  const vision = useVision();
  const values = vision?.values ?? [];
  const ids = (goal.valueIds ?? []).filter((id) => values.some((v) => v.id === id));
  const linked = ids.map((id) => values.find((v) => v.id === id)!);
  const others = values.filter((v) => !ids.includes(v.id));
  const set = (next: string[]) => void actions.updateGoal(goal.id, { valueIds: next });
  if (vision === undefined) return null;
  return (
    <section aria-label="Why this matters" className="mb-2">
      <SectionLabel>Why this matters</SectionLabel>
      {linked.length ? (
        <ul className="flex flex-col gap-1">
          {linked.map((v) => (
            <li key={v.id} className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-fill">
              <Heart className="mt-0.5 size-4 shrink-0 text-accent-text" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 text-callout">
                <span className="font-semibold">{v.name}</span>
                {v.description ? <span className="text-label-secondary"> — {v.description}</span> : null}
              </span>
              <button
                type="button"
                aria-label={`Unlink ${v.name}`}
                onClick={() => set(ids.filter((i) => i !== v.id))}
                className="grid size-6 place-items-center rounded-full text-label-tertiary opacity-100 hover:bg-fill-strong hover:text-label lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {values.length ? (
        others.length ? (
          <Picker
            label="Link a value"
            value={null as string | null}
            options={others.map((v) => ({ value: v.id, label: v.name }))}
            onChange={(id) => id && set([...ids, id])}
            trigger={
              <button
                type="button"
                className="flex h-row items-center gap-2 rounded-md px-2 text-callout text-label-tertiary hover:bg-fill"
              >
                <Plus className="size-4" />{" "}
                {linked.length ? "Link another value" : "Which of your values does this serve?"}
              </button>
            }
          />
        ) : null
      ) : (
        <Link
          href="/vision"
          className="flex h-row items-center gap-2 px-2 text-callout text-label-tertiary hover:text-label"
        >
          <Plus className="size-4" /> Set your values on the Vision page to link them here
        </Link>
      )}
    </section>
  );
}
