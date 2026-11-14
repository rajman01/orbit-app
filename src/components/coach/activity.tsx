"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { UNDO_DAYS } from "@/features/coach/write-tools";
import { ActionCard, type AiAction } from "./action-card";

const PAGE = 15;

/** PRD §10.5: everything the coach did or suggested in the last 30 days, each undoable. */
export function AiActivity() {
  const { db } = useSync();
  const [shown, setShown] = useState(PAGE);
  const actions = useLiveQuery(async () => {
    const since = Date.now() - UNDO_DAYS * 86_400_000;
    const rows = await db.aiActions.where("at").above(since).toArray();
    return rows.filter((a) => a.deletedAt == null).sort((a, b) => b.at - a.at);
  }, [db]);
  if (!actions) return null;
  if (actions.length === 0) {
    return (
      <p className="px-4 py-3 text-callout text-label-secondary">Nothing yet. Changes the coach makes show up here.</p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 p-3" aria-label="AI activity">
      {actions.slice(0, shown).map((a: AiAction) => (
        <div key={a.id} className="flex flex-col gap-0.5">
          <span className="px-1 text-caption text-label-tertiary">{when(a.at)}</span>
          <ActionCard action={a} />
        </div>
      ))}
      {actions.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-1 self-center rounded-full px-3 py-1 text-footnote font-semibold text-accent-text hover:bg-accent-fill"
        >
          Show more
        </button>
      ) : null}
    </div>
  );
}

function when(at: number): string {
  return new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
