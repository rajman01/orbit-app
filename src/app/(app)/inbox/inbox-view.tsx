"use client";

import { ArrowRight, Inbox, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrainDump } from "@/components/coach/brain-dump";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { useCommands } from "@/components/app/commands";
import { EmptyState } from "@/components/app/empty-state";
import { InboxZeroScene } from "@/components/app/scenes";
import { AreaIcon } from "@/components/areas/area-icon";
import { AreaPicker, DatePicker, GoalPicker, PriorityPicker } from "@/components/tasks/pickers";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useAllTasks, useAreas } from "@/features/data";
import type { Task } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { addDays } from "@/lib/dates";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/** Inbox (PRD INB-1 – INB-4): everything captured, waiting for a decision. */
export function InboxView() {
  // Quick add sends long, messy text here (?dump=…) to be sorted by the coach.
  const dump = useSearchParams().get("dump") ?? "";
  const tasks = useAllTasks();
  const inbox = (tasks ?? [])
    .filter((t) => t.status === "inbox" && !t.parentTaskId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const { openQuickAdd } = useCommands();
  const [triaging, setTriaging] = useState(false);

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle={inbox.length ? `${inbox.length} to process` : undefined}
        actions={
          inbox.length ? (
            <Button onClick={() => setTriaging(true)} icon={<ArrowRight className="size-4" />}>
              Process inbox
            </Button>
          ) : null
        }
      />
      <PageBody>
        {!triaging ? <BrainDump key={dump} initialText={dump} /> : null}
        {triaging && inbox.length ? (
          <Triage tasks={inbox} onDone={() => setTriaging(false)} />
        ) : tasks && !inbox.length ? (
          <EmptyState
            icon={Inbox}
            illustration={<InboxZeroScene />}
            title="Inbox zero"
            body="Capture anything with C or the + button. Sort it later."
            action={
              <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => openQuickAdd()}>
                Capture something
              </Button>
            }
          />
        ) : (
          <TaskList tasks={inbox} sort={false} label="Inbox" />
        )}
      </PageBody>
    </>
  );
}

/** One item at a time: decide where it goes, then move on (keyboard-friendly). */
function Triage({ tasks, onDone }: { tasks: Task[]; onDone: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const areas = useAreas() ?? [];
  const todayDay = useToday();
  const { transition } = useOrbitMotion();
  const [processed, setProcessed] = useState(0);
  const task = tasks[0];

  const file = async (status: "todo" | "backlog", scheduledDate?: string) => {
    if (!task) return;
    await actions.updateTask(task, { status, ...(scheduledDate ? { scheduledDate } : {}) });
    setProcessed((p) => p + 1);
  };
  const remove = async () => {
    if (!task) return;
    await actions.deleteTask(task);
    setProcessed((p) => p + 1);
    toast({ message: "Deleted" });
  };

  useEffect(() => {
    if (!task) onDone();
  }, [task, onDone]);

  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && areas[n - 1]) {
        e.preventDefault();
        void actions.updateTask(task, { areaId: areas[n - 1].id });
      } else if (e.key === "t") void file("todo", todayDay);
      else if (e.key === "w") void file("todo", addDays(todayDay, 1));
      else if (e.key === "b") void file("backlog");
      else if (e.key === "Enter") void file("todo");
      else if (e.key === "Backspace" || e.key === "Delete") void remove();
      else if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!task) return null;

  return (
    <section aria-label="Process inbox" className="flex flex-col gap-4">
      <p className="text-footnote text-label-secondary">
        {processed} processed · {tasks.length} left
      </p>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={task.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={transition("default")}
          className="flex flex-col gap-4 rounded-xl border border-separator bg-surface p-5 shadow-2"
        >
          <h2 className="text-title2">{task.title}</h2>
          <div className="flex flex-wrap gap-1">
            <AreaPicker value={task.areaId} onChange={(a) => void actions.updateTask(task, { areaId: a })} />
            <GoalPicker
              value={task.goalId}
              areaId={task.areaId}
              onChange={(g) => void actions.updateTask(task, { goalId: g })}
            />
            <PriorityPicker value={task.priority} onChange={(p) => void actions.updateTask(task, { priority: p })} />
            <DatePicker
              label="Due date"
              placeholder="Due date"
              value={task.dueDate}
              todayDay={todayDay}
              onChange={(d) => void actions.updateTask(task, { dueDate: d })}
            />
          </div>
          {areas.length ? (
            <div className="flex flex-wrap gap-1.5">
              {areas.slice(0, 9).map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={task.areaId === a.id}
                  onClick={() => void actions.updateTask(task, { areaId: a.id })}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-medium ${task.areaId === a.id ? "bg-accent-fill text-accent-text" : "bg-fill text-label-secondary"}`}
                >
                  <AreaIcon icon={a.icon} color={a.color} className="size-3.5" /> {a.name}
                  <span className="hidden text-label-tertiary lg:inline">{i + 1}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="secondary" onClick={() => void file("todo", todayDay)}>
              Today{" "}
              <span className="hidden lg:inline">
                <Kbd>T</Kbd>
              </span>
            </Button>
            <Button variant="secondary" onClick={() => void file("todo", addDays(todayDay, 1))}>
              Tomorrow{" "}
              <span className="hidden lg:inline">
                <Kbd>W</Kbd>
              </span>
            </Button>
            <Button variant="secondary" onClick={() => void file("backlog")}>
              Backlog{" "}
              <span className="hidden lg:inline">
                <Kbd>B</Kbd>
              </span>
            </Button>
            <Button onClick={() => void file("todo")}>
              To do{" "}
              <span className="hidden lg:inline">
                <Kbd>↵</Kbd>
              </span>
            </Button>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
              Delete
            </Button>
            <Button variant="plain" onClick={onDone}>
              Stop
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
