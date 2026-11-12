"use client";

import { Sun } from "lucide-react";
import { useState } from "react";
import { PageBody, PageHeader } from "@/components/app/app-shell";
import { EmptyState } from "@/components/app/empty-state";
import { SectionLabel, TaskList } from "@/components/tasks/task-list";
import { Input } from "@/components/ui/input";
import { useActions } from "@/features/actions";
import { useAllTasks } from "@/features/data";
import { isOpen, type Task } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { longDayLabel } from "@/lib/dates";

/**
 * Today, Phase 1A version: what's overdue, what's planned or due today, and what's in progress.
 * Phase 1B turns this into the full Today (Must-dos, skip flow, focus mode).
 */
export function TodayView() {
  const actions = useActions();
  const all = useAllTasks();
  const todayDay = useToday();
  const [title, setTitle] = useState("");

  const top = (all ?? []).filter((t) => !t.parentTaskId);
  const day = (t: Task) => t.scheduledDate ?? t.dueDate;
  const overdue = top.filter(
    (t) =>
      isOpen(t) &&
      t.status !== "inbox" &&
      ((t.dueDate && t.dueDate < todayDay) ||
        (t.scheduledDate && t.scheduledDate < todayDay && !(t.dueDate && t.dueDate >= todayDay))),
  );
  const todays = top.filter(
    (t) =>
      !overdue.includes(t) &&
      (t.scheduledDate === todayDay || t.dueDate === todayDay) &&
      (isOpen(t) || (t.completedAt != null && t.status === "done")),
  );
  const inProgress = top.filter((t) => t.status === "in_progress" && !overdue.includes(t) && !todays.includes(t));
  const openToday = todays.filter(isOpen).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    setTitle("");
    await actions.createTask({ title: value, status: "todo", scheduledDate: todayDay });
  }

  return (
    <>
      <PageHeader title="Today" subtitle={longDayLabel(todayDay)} />
      <PageBody>
        <form onSubmit={add} className="mb-4">
          <label className="sr-only" htmlFor="new-task">
            New task
          </label>
          <Input
            id="new-task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task for today and press Enter"
            autoComplete="off"
            enterKeyHint="done"
          />
        </form>

        {all && !overdue.length && !todays.length && !inProgress.length ? (
          <EmptyState
            icon={Sun}
            title="Nothing planned yet"
            body="Add the first thing you want to get done today, or schedule tasks from Tasks and Goals."
          />
        ) : null}

        {overdue.length ? (
          <>
            <SectionLabel count={overdue.length}>Overdue</SectionLabel>
            <TaskList tasks={overdue} label="Overdue" />
          </>
        ) : null}
        {todays.length ? (
          <>
            <SectionLabel count={openToday}>Today</SectionLabel>
            <TaskList tasks={todays.sort((a, b) => (day(a) ?? "").localeCompare(day(b) ?? ""))} label="Today" />
          </>
        ) : null}
        {inProgress.length ? (
          <>
            <SectionLabel count={inProgress.length}>In progress</SectionLabel>
            <TaskList tasks={inProgress} label="In progress" />
          </>
        ) : null}
      </PageBody>
    </>
  );
}
