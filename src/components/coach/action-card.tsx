"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useSync } from "@/components/app/sync-provider";
import { useTaskPanel } from "@/components/tasks/task-panel";
import { useToast } from "@/components/ui/toast";
import type { Change } from "@/features/coach/record";
import { acceptProposal, dismissProposal, undoAction } from "@/features/coach/write-tools";
import { cn } from "@/lib/cn";
import type { SyncedDoc } from "@/lib/sync/entities";

export type AiAction = SyncedDoc<"aiActions">;

/** The coach's actions for these tool calls, in call order. */
export function useAiActions(toolUseIds: string[]): AiAction[] | undefined {
  const { db } = useSync();
  const key = toolUseIds.join(",");
  return useLiveQuery(async () => {
    if (!toolUseIds.length) return [];
    const rows = await db.aiActions.where("toolUseId").anyOf(toolUseIds).toArray();
    const order = new Map(toolUseIds.map((id, i) => [id, i]));
    return rows.filter((r) => r.deletedAt == null).sort((a, b) => order.get(a.toolUseId!)! - order.get(b.toolUseId!)!);
  }, [db, key]);
}

/** Where "View" goes for an action: the task or goal it made or changed. */
export function actionTarget(a: AiAction): { kind: "task" | "goal" | "habits"; id?: string } | null {
  const changes = a.changes as Change[];
  const made = (entity: string) => changes.find((c) => c.entity === entity && c.before === null)?.id;
  const input = a.input as Record<string, string | undefined>;
  switch (a.tool) {
    case "create_task":
      return made("tasks") ? { kind: "task", id: made("tasks") } : null;
    case "update_task":
    case "complete_task":
    case "reschedule_task":
      return { kind: "task", id: input.id };
    case "create_goal":
      return made("goals") ? { kind: "goal", id: made("goals") } : null;
    case "update_goal":
      return { kind: "goal", id: input.id };
    case "add_key_result":
    case "add_milestone":
      return { kind: "goal", id: input.goalId };
    case "create_habit":
    case "update_habit":
      return { kind: "habits" };
    default:
      return null;
  }
}

export function useActionControls() {
  const engine = useSync();
  const user = useCurrentUser();
  const toast = useToast();
  return {
    undo: async (a: AiAction) => {
      await undoAction(engine, a.id);
      toast({ message: `Undone: ${a.summary}` });
    },
    accept: async (a: AiAction) => {
      try {
        await acceptProposal(a.id, { engine, db: engine.db, userId: user.id, now: Date.now() });
      } catch (err) {
        toast({ message: err instanceof Error ? err.message : "Couldn't apply that." });
      }
    },
    dismiss: (a: AiAction) => dismissProposal(engine, a.id),
  };
}

const small =
  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-footnote font-semibold transition-colors disabled:opacity-40";

/** One change the coach made or suggested, with View / Undo or Accept / Dismiss (PRD §10.6). */
export function ActionCard({ action }: { action: AiAction }) {
  const controls = useActionControls();
  const panel = useTaskPanel();
  const [working, setWorking] = useState(false);
  const run = (fn: () => Promise<unknown>) => async () => {
    setWorking(true);
    try {
      await fn();
    } finally {
      setWorking(false);
    }
  };
  const target = action.status === "applied" ? actionTarget(action) : null;
  const done = action.status === "undone" || action.status === "dismissed";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-separator px-3 py-2",
        action.status === "proposed" ? "bg-[color-mix(in_srgb,var(--info)_8%,transparent)]" : "bg-surface",
      )}
      data-ai-action={action.status}
    >
      <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden />
      <span className={cn("min-w-0 flex-1 text-footnote", done && "text-label-tertiary line-through")}>
        {action.summary}
      </span>
      {action.status === "applied" ? (
        <span className="flex items-center gap-1">
          {target?.kind === "task" && target.id ? (
            <button
              type="button"
              className={cn(small, "text-accent-text hover:bg-accent-fill")}
              onClick={() => panel.open(target.id!)}
            >
              View
            </button>
          ) : target?.kind === "goal" && target.id ? (
            <Link href={`/goal?id=${target.id}`} className={cn(small, "text-accent-text hover:bg-accent-fill")}>
              View
            </Link>
          ) : target?.kind === "habits" ? (
            <Link href="/habits" className={cn(small, "text-accent-text hover:bg-accent-fill")}>
              View
            </Link>
          ) : null}
          <button
            type="button"
            disabled={working}
            onClick={run(() => controls.undo(action))}
            aria-label={`Undo: ${action.summary}`}
            className={cn(small, "text-label-secondary hover:bg-fill")}
          >
            <Undo2 className="size-3.5" /> Undo
          </button>
        </span>
      ) : action.status === "proposed" ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            disabled={working}
            onClick={run(() => controls.dismiss(action))}
            aria-label={`Dismiss: ${action.summary}`}
            className={cn(small, "text-label-secondary hover:bg-fill")}
          >
            Dismiss
          </button>
          <button
            type="button"
            disabled={working}
            onClick={run(() => controls.accept(action))}
            aria-label={`Accept: ${action.summary}`}
            className={cn(small, "bg-accent text-on-accent hover:brightness-95")}
          >
            <Check className="size-3.5" /> Accept
          </button>
        </span>
      ) : (
        <span className="text-footnote text-label-tertiary">{action.status === "undone" ? "Undone" : "Dismissed"}</span>
      )}
    </div>
  );
}

/** All of one reply's changes: one card each, and "Undo all" when there are several. */
export function ActionList({ toolUseIds }: { toolUseIds: string[] }) {
  const actions = useAiActions(toolUseIds);
  const controls = useActionControls();
  const [working, setWorking] = useState(false);
  if (!actions?.length) return null;
  const applied = actions.filter((a) => a.status === "applied");
  const proposed = actions.filter((a) => a.status === "proposed");
  const all = async (fn: (a: AiAction) => Promise<unknown>, list: AiAction[]) => {
    setWorking(true);
    try {
      for (const a of [...list].reverse()) await fn(a);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((a) => (
        <ActionCard key={a.id} action={a} />
      ))}
      {applied.length > 1 || proposed.length > 1 ? (
        <div className="flex justify-end gap-1">
          {proposed.length > 1 ? (
            <button
              type="button"
              disabled={working}
              onClick={() => void all(controls.accept, [...proposed].reverse())}
              className={cn(small, "bg-accent text-on-accent")}
            >
              Accept all ({proposed.length})
            </button>
          ) : null}
          {applied.length > 1 ? (
            <button
              type="button"
              disabled={working}
              onClick={() => void all(controls.undo, applied)}
              className={cn(small, "text-label-secondary hover:bg-fill")}
            >
              <Undo2 className="size-3.5" /> Undo all ({applied.length})
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
