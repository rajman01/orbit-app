"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Sun, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { useSync } from "@/components/app/sync-provider";
import { IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import type { SyncedDoc } from "@/lib/sync/entities";

type Task = SyncedDoc<"tasks">;

const now = () => Date.now();

/**
 * Phase 0 Today: a minimal task list proving the local-first loop
 * (instant local writes → outbox → sync). The full Today view arrives in Phase 1.
 */
export function TodayView() {
  const engine = useSync();
  const toast = useToast();
  const { transition } = useOrbitMotion();
  const [title, setTitle] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const tasks = useLiveQuery(
    async () => {
      const all = await engine.db.tasks.filter((t) => t.deletedAt == null).toArray();
      return all.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.order - b.order);
    },
    [engine],
  );

  const visible = (tasks ?? []).filter((t) => !hidden.has(t.id));
  const open = visible.filter((t) => t.status !== "done").length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle("");
    await engine.create("tasks", { title: value, status: "todo", completedAt: null, order: now() });
  }

  async function toggle(t: Task, done: boolean) {
    await engine.update("tasks", t.id, { status: done ? "done" : "todo", completedAt: done ? now() : null });
    if (done) {
      toast({ message: "Task completed", action: { label: "Undo", onClick: () => void engine.update("tasks", t.id, { status: "todo", completedAt: null }) } });
    }
  }

  // Deletes win over edits once synced, so the real delete waits until the Undo window closes.
  function remove(t: Task) {
    setHidden((h) => new Set(h).add(t.id));
    const timer = setTimeout(() => {
      pendingDeletes.current.delete(t.id);
      void engine.remove("tasks", t.id);
    }, 5000);
    pendingDeletes.current.set(t.id, timer);
    toast({
      message: "Task deleted",
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(pendingDeletes.current.get(t.id));
          pendingDeletes.current.delete(t.id);
          setHidden((h) => {
            const next = new Set(h);
            next.delete(t.id);
            return next;
          });
        },
      },
    });
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <PageHeader title="Today" subtitle={today} />
      <div className="mx-auto w-full max-w-[880px] px-4 lg:px-6">
        <form onSubmit={add} className="mb-4">
          <label className="sr-only" htmlFor="new-task">
            New task
          </label>
          <Input
            id="new-task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task and press Enter"
            autoComplete="off"
            enterKeyHint="done"
          />
        </form>

        {tasks && visible.length === 0 ? (
          <EmptyState icon={Sun} title="Nothing planned yet" body="Add the first thing you want to get done today." />
        ) : (
          <>
            {visible.length > 0 ? (
              <p className="mb-1 px-1 text-micro text-label-secondary uppercase">{open} open</p>
            ) : null}
            <ul className="overflow-hidden rounded-lg bg-surface shadow-1 lg:bg-transparent lg:shadow-none">
              <AnimatePresence initial={false}>
                {visible.map((t) => (
                  <motion.li
                    key={t.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={transition("default")}
                    className="group border-b border-separator last:border-b-0 lg:rounded-md lg:border-b-0 lg:hover:bg-fill"
                  >
                    <div className="flex min-h-row items-center gap-1 pr-2 pl-1">
                      <Checkbox checked={t.status === "done"} onChange={(d) => void toggle(t, d)} label={`Complete ${t.title}`} />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate transition-colors duration-200",
                          t.status === "done" && "text-label-tertiary line-through",
                        )}
                      >
                        {t.title}
                      </span>
                      <IconButton
                        label={`Delete ${t.title}`}
                        icon={<Trash2 className="size-4" strokeWidth={1.75} />}
                        onClick={() => remove(t)}
                        className="lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                      />
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}
      </div>
    </>
  );
}
