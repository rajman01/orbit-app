"use client";

import { Link2, Lock, Plus, X } from "lucide-react";
import { useState } from "react";
import { Popover } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useAllTasks } from "@/features/data";
import { blocking, wouldLoop } from "@/features/tasks/links";
import { isOpen, taskCode, type Task } from "@/features/tasks/model";
import { cn } from "@/lib/cn";
import { useTaskPanel } from "./task-panel";

/** TASK-8: what this task waits on ("Blocked by") and what waits on it ("Blocks"). */
export function TaskLinks({ task }: { task: Task }) {
  const actions = useActions();
  const toast = useToast();
  const panel = useTaskPanel();
  const all = useAllTasks() ?? [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const byId = new Map(all.map((t) => [t.id, t]));
  const blockers = (task.blockedBy ?? []).map((id) => byId.get(id)).filter((t): t is Task => !!t && !t.deletedAt);
  const blocks = blocking(task.id, all).filter((t) => !t.parentTaskId);
  const waiting = blockers.filter(isOpen).length;
  const query = q.trim().toLowerCase();
  const options = all
    .filter(
      (t) =>
        isOpen(t) &&
        !t.parentTaskId &&
        t.id !== task.id &&
        !(task.blockedBy ?? []).includes(t.id) &&
        (!query || t.title.toLowerCase().includes(query) || taskCode(t)?.toLowerCase() === query),
    )
    .slice(0, 8);

  const row = (t: Task, onRemove?: () => void) => (
    <li key={t.id} className="flex min-h-9 items-center gap-2 rounded-md px-1 hover:bg-fill">
      <button
        type="button"
        onClick={() => panel.open(t.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {taskCode(t) ? (
          <span className="w-12 shrink-0 font-mono text-caption text-label-tertiary">{taskCode(t)}</span>
        ) : null}
        <span className={cn("truncate text-callout", !isOpen(t) && "text-label-tertiary line-through")}>{t.title}</span>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove blocker ${t.title}`}
          className="grid size-7 shrink-0 place-items-center rounded-full text-label-tertiary hover:bg-fill-strong"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </li>
  );

  return (
    <section aria-label="Links" className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1.5 text-footnote font-medium text-label-secondary">
        {waiting ? <Lock className="size-3.5" /> : <Link2 className="size-3.5" />}
        Blocked by
        {waiting ? <span className="text-warning-text">· waiting on {waiting}</span> : null}
      </h3>
      {blockers.length ? (
        <ul aria-label="Blocked by" className="flex flex-col">
          {blockers.map((b) => row(b, () => void actions.removeBlocker(task, b.id)))}
        </ul>
      ) : null}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
        trigger={
          <button
            type="button"
            className="flex h-8 w-fit items-center gap-1.5 rounded-md px-1 text-callout text-label-secondary hover:bg-fill"
          >
            <Plus className="size-4" /> Add a task it waits on
          </button>
        }
      >
        <input
          autoFocus
          aria-label="Find a task"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks or ORB-12"
          className="mb-1 h-9 w-full rounded-md bg-surface-sunken px-2 text-callout outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <ul aria-label="Tasks to wait on" className="flex max-h-64 flex-col overflow-y-auto">
          {options.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={async () => {
                  if (wouldLoop(task.id, t.id, all)) {
                    toast({ message: `“${t.title}” already waits on this task` });
                    return;
                  }
                  await actions.addBlocker(task, t.id);
                  setOpen(false);
                  setQ("");
                }}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-callout hover:bg-fill"
              >
                {taskCode(t) ? (
                  <span className="w-12 shrink-0 font-mono text-caption text-label-tertiary">{taskCode(t)}</span>
                ) : null}
                <span className="truncate">{t.title}</span>
              </button>
            </li>
          ))}
          {!options.length ? (
            <li className="px-2 py-2 text-footnote text-label-tertiary">No open tasks match.</li>
          ) : null}
        </ul>
      </Popover>
      {blocks.length ? (
        <>
          <h3 className="mt-2 text-footnote font-medium text-label-secondary">Blocks</h3>
          <ul aria-label="Blocks" className="flex flex-col">
            {blocks.map((b) => row(b))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
