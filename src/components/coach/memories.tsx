"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { useActions } from "@/features/actions";

/** AI-9: what the coach remembers about you, visible and editable. */
export function CoachMemories() {
  const { db } = useSync();
  const actions = useActions();
  const [draft, setDraft] = useState("");
  const memories = useLiveQuery(
    async () =>
      (await db.aiMemories.toArray())
        .filter((m) => m.deletedAt == null && m.archivedAt == null)
        .sort((a, b) => a.createdAt - b.createdAt),
    [db],
  );
  const add = () => {
    if (!draft.trim()) return;
    void actions.remember(draft, "user");
    setDraft("");
  };
  return (
    <div className="flex flex-col" aria-label="What the coach remembers">
      {memories?.length === 0 ? (
        <p className="px-4 py-3 text-callout text-label-secondary">
          Nothing yet. The coach saves notes here when something will help later, and you can add your own.
        </p>
      ) : null}
      {(memories ?? []).map((m) => (
        <MemoryRow
          key={m.id}
          text={m.text}
          byCoach={m.source === "coach"}
          onSave={(text) => (text.trim() ? actions.updateMemory(m.id, text) : actions.forgetMemory(m.id))}
          onForget={() => actions.forgetMemory(m.id)}
        />
      ))}
      <form
        className="flex items-center gap-2 px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Plus className="size-4 shrink-0 text-label-tertiary" aria-hidden />
        <input
          aria-label="Tell the coach something about you"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="e.g. I do my best work before 11am"
          className="h-9 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-label-tertiary"
        />
        {draft.trim() ? (
          <button type="submit" className="h-8 rounded-full bg-accent px-3 text-footnote font-semibold text-on-accent">
            Add
          </button>
        ) : null}
      </form>
    </div>
  );
}

function MemoryRow({
  text,
  byCoach,
  onSave,
  onForget,
}: {
  text: string;
  byCoach: boolean;
  onSave: (text: string) => unknown;
  onForget: () => unknown;
}) {
  const [value, setValue] = useState(text);
  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      {byCoach ? (
        <Sparkles className="size-4 shrink-0 text-accent" aria-label="Saved by the coach" role="img" />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <input
        aria-label="Note"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== text && void onSave(value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        maxLength={500}
        className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-body outline-none hover:bg-fill focus-visible:ring-2 focus-visible:ring-accent"
      />
      <button
        type="button"
        aria-label={`Forget: ${text}`}
        onClick={() => void onForget()}
        className="grid size-8 shrink-0 place-items-center rounded-full text-label-tertiary hover:bg-fill hover:text-label"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
