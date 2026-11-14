"use client";

import { UserPlus, X } from "lucide-react";
import Link from "next/link";
import { Picker } from "@/components/ui/picker";
import { useActions } from "@/features/actions";
import { usePeople } from "@/features/data";
import type { Goal } from "@/features/goals/model";
import { PersonAvatar } from "./avatar";

/** REL-7: the people a goal is about, shown on the goal and on their pages. */
export function GoalPeople({ goal }: { goal: Goal }) {
  const actions = useActions();
  const people = usePeople() ?? [];
  const ids = goal.personIds ?? [];
  const linked = ids.map((id) => people.find((p) => p.id === id)).filter((p) => p != null);
  const others = people.filter((p) => !ids.includes(p.id));
  const set = (next: string[]) => void actions.updateGoal(goal.id, { personIds: next });
  if (!people.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="People">
      {linked.map((p) => (
        <span key={p.id} className="inline-flex h-7 items-center gap-1 rounded-full bg-fill pr-1 pl-0.5 text-footnote">
          <Link href={`/person?id=${p.id}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
            <PersonAvatar person={p} size={24} /> {p.name}
          </Link>
          <button
            type="button"
            aria-label={`Unlink ${p.name}`}
            onClick={() => set(ids.filter((i) => i !== p.id))}
            className="grid size-5 place-items-center rounded-full text-label-tertiary hover:bg-fill-strong hover:text-label"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {others.length && ids.length < 20 ? (
        <Picker
          label="Link a person"
          value={null as string | null}
          options={others.map((p) => ({ value: p.id, label: p.name, icon: <PersonAvatar person={p} size={20} /> }))}
          onChange={(id) => id && set([...ids, id])}
          trigger={
            <button
              type="button"
              aria-label="Link a person"
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-footnote font-medium text-label-secondary hover:bg-fill"
            >
              <UserPlus className="size-3.5" /> {linked.length ? "" : "Person"}
            </button>
          }
        />
      ) : null}
    </div>
  );
}
