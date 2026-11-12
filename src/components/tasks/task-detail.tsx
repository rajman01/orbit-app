"use client";

import { Flag, MoreHorizontal, Play, Plus, Repeat, Timer, Trash2, X } from "lucide-react";
import { useFocus } from "@/components/focus/focus-mode";
import { useSkipFlow } from "@/components/skip/skip-flow";
import { useState } from "react";
import { IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Menu, MenuItem } from "@/components/ui/menu";
import { ChipButton, Picker } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useAllTasks, useFocusSessions, useMilestones, useTask, useTaskEvents, type TaskEvent } from "@/features/data";
import { isSkip, skipReasonLabel } from "@/features/today/model";
import { isOpen, recurrenceLabel, STATUS_META, taskCode, type Task, type TaskStatus } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayLabel, weekday } from "@/lib/dates";
import type { Recurrence } from "@/lib/sync/entities";
import { AreaPicker, DatePicker, EffortPicker, GoalPicker, PriorityPicker, StatusPicker } from "./pickers";

export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useTask(taskId);
  if (task === undefined) return <div className="h-40" aria-busy="true" />;
  if (task === null) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center text-subhead text-label-secondary">
        This task was deleted.
        <button type="button" className="font-semibold text-accent-text" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }
  // Re-mount when switching tasks so text fields reset.
  return <TaskDetailInner key={task.id} task={task} onClose={onClose} />;
}

function TaskDetailInner({ task, onClose }: { task: Task; onClose: () => void }) {
  const actions = useActions();
  const toast = useToast();
  const todayDay = useToday();
  const focus = useFocus();
  const skip = useSkipFlow();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [nextStep, setNextStep] = useState(task.nextStep ?? "");
  const update = (patch: Parameters<typeof actions.updateTask>[1]) => actions.updateTask(task, patch);
  const code = taskCode(task);

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) void update({ title: t });
    else setTitle(task.title);
  };

  return (
    <div className="flex flex-col gap-5 pb-8 lg:p-6">
      <header className="flex items-center justify-between gap-2">
        <span className="font-mono text-caption text-label-tertiary">{code ?? "New task · syncing"}</span>
        <div className="flex items-center gap-1">
          {isOpen(task) && !task.parentTaskId ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                void focus.start(task);
              }}
              className="mr-1 flex h-8 items-center gap-1 rounded-full bg-accent-fill px-3 text-footnote font-semibold text-accent-text hover:brightness-95"
            >
              <Play className="size-3.5" fill="currentColor" aria-hidden /> Start focus
            </button>
          ) : null}
          <Menu trigger={<IconButton label="More actions" icon={<MoreHorizontal className="size-4" />} />} align="end">
            <MenuItem
              icon={<Trash2 />}
              destructive
              onSelect={() => {
                void actions.deleteTask(task);
                onClose();
                toast({ message: "Task deleted" });
              }}
            >
              Delete task
            </MenuItem>
          </Menu>
          <IconButton label="Close" icon={<X className="size-4" />} onClick={onClose} />
        </div>
      </header>

      <textarea
        aria-label="Title"
        value={title}
        rows={1}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
        className="field-sizing-content resize-none bg-transparent text-title2 outline-none placeholder:text-label-tertiary"
      />

      <section aria-label="Properties" className="grid grid-cols-[96px_1fr] items-center gap-x-2 gap-y-1 text-callout">
        <Prop label="Status">
          <StatusPicker value={task.status} onChange={(s) => void update({ status: s })} />
        </Prop>
        <Prop label="Priority">
          <PriorityPicker value={task.priority} onChange={(p) => void update({ priority: p })} />
        </Prop>
        <Prop label="Effort">
          <EffortPicker value={task.effort} onChange={(e) => void update({ effort: e })} />
        </Prop>
        <Prop label="Area">
          <AreaPicker value={task.areaId} onChange={(a) => void update({ areaId: a })} />
        </Prop>
        <Prop label="Goal">
          <GoalPicker
            value={task.goalId}
            areaId={task.areaId}
            onChange={(g) => void update({ goalId: g, milestoneId: null })}
          />
        </Prop>
        {task.goalId ? (
          <Prop label="Milestone">
            <MilestonePicker
              goalId={task.goalId}
              value={task.milestoneId}
              onChange={(m) => void update({ milestoneId: m })}
            />
          </Prop>
        ) : null}
        <Prop label="Due">
          <DatePicker
            label="Due date"
            placeholder="No due date"
            value={task.dueDate}
            todayDay={todayDay}
            overdue={isOpen(task) && !!task.dueDate && task.dueDate < todayDay}
            onChange={(d) => void update({ dueDate: d })}
          />
        </Prop>
        <Prop label="Scheduled">
          <DatePicker
            label="Do it on"
            placeholder="Not scheduled"
            value={task.scheduledDate}
            todayDay={todayDay}
            onChange={(d) => {
              // No silent skipping (PRD §8.1): moving a planned task off today asks why.
              if (isOpen(task) && isSkip(task, todayDay, d)) skip.open(task, { to: d });
              else void update({ scheduledDate: d });
            }}
          />
        </Prop>
        <Prop label="Repeat">
          <RecurrencePicker
            value={task.recurrence}
            dueDate={task.dueDate ?? todayDay}
            onChange={(r) => void update({ recurrence: r })}
          />
        </Prop>
      </section>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-footnote font-medium text-label-secondary">
          <Flag className="size-3.5" strokeWidth={1.75} /> Next step — something you can start in 2 minutes
        </span>
        <input
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          onBlur={() => nextStep.trim() !== (task.nextStep ?? "") && void update({ nextStep: nextStep.trim() || null })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="e.g. Open the doc and write the first heading"
          className="h-control rounded-md bg-surface-sunken px-3 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-footnote font-medium text-label-secondary">Notes</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== task.description && void update({ description })}
          rows={3}
          placeholder="Add details, links, context…"
          className="field-sizing-content min-h-20 resize-none rounded-md bg-surface-sunken px-3 py-2 text-body outline-none placeholder:text-label-tertiary focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      {!task.parentTaskId ? <Subtasks task={task} /> : null}
      <FocusSummary taskId={task.id} />
      <History taskId={task.id} todayDay={todayDay} />
    </div>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-footnote text-label-secondary">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function MilestonePicker({
  goalId,
  value,
  onChange,
}: {
  goalId: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const milestones = useMilestones(goalId) ?? [];
  const current = milestones.find((m) => m.id === value);
  return (
    <Picker
      label="Milestone"
      value={value}
      options={[{ value: null, label: "No milestone" }, ...milestones.map((m) => ({ value: m.id, label: m.title }))]}
      onChange={onChange}
      trigger={
        <ChipButton aria-label="Milestone">
          {current ? current.title : <span className="text-label-tertiary">None</span>}
        </ChipButton>
      }
    />
  );
}

type RepeatKey = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

function RecurrencePicker({
  value,
  dueDate,
  onChange,
}: {
  value: Recurrence | null;
  dueDate: string;
  onChange: (r: Recurrence | null) => void;
}) {
  const wd = weekday(dueDate);
  const presets: Record<RepeatKey, Recurrence | null> = {
    none: null,
    daily: { freq: "daily", interval: 1, mode: "fixed" },
    weekdays: { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5], mode: "fixed" },
    weekly: { freq: "weekly", interval: 1, byWeekday: [wd], mode: "fixed" },
    biweekly: { freq: "weekly", interval: 2, byWeekday: [wd], mode: "fixed" },
    monthly: { freq: "monthly", interval: 1, mode: "fixed" },
  };
  const labels: Record<RepeatKey, string> = {
    none: "Doesn't repeat",
    daily: "Every day",
    weekdays: "Every weekday",
    weekly: recurrenceLabel(presets.weekly)!,
    biweekly: recurrenceLabel(presets.biweekly)!,
    monthly: "Every month",
  };
  const current =
    (Object.keys(presets) as RepeatKey[]).find((k) => JSON.stringify(presets[k]) === JSON.stringify(value)) ??
    (value ? "custom" : "none");
  return (
    <Picker
      label="Repeat"
      value={current}
      options={(Object.keys(presets) as RepeatKey[]).map((k) => ({ value: k, label: labels[k] }))}
      onChange={(k) => k !== "custom" && onChange(presets[k as RepeatKey])}
      trigger={
        <ChipButton aria-label="Repeat">
          <Repeat className="size-4 text-label-secondary" strokeWidth={1.75} />
          {value ? recurrenceLabel(value) : <span className="text-label-tertiary">Doesn&rsquo;t repeat</span>}
        </ChipButton>
      }
    />
  );
}

function Subtasks({ task }: { task: Task }) {
  const actions = useActions();
  const all = useAllTasks();
  const subs = (all ?? []).filter((t) => t.parentTaskId === task.id).sort((a, b) => a.order - b.order);
  const [title, setTitle] = useState("");
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle("");
    await actions.createTask({
      title: t,
      parentTaskId: task.id,
      status: "todo",
      areaId: task.areaId,
      goalId: task.goalId,
    });
  };
  return (
    <section aria-label="Subtasks" className="flex flex-col gap-1">
      <h3 className="text-footnote font-medium text-label-secondary">
        Subtasks{" "}
        {subs.length ? (
          <span className="tabular">
            · {subs.filter((s) => s.status === "done").length}/{subs.length}
          </span>
        ) : null}
      </h3>
      {subs.map((s) => (
        <div key={s.id} className="group flex items-center gap-1">
          <Checkbox
            shape="square"
            color="var(--accent)"
            checked={s.status === "done"}
            onChange={(d) => void actions.setTaskDone(s, d)}
            label={`Complete ${s.title}`}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body",
              s.status === "done" && "text-label-tertiary line-through",
            )}
          >
            {s.title}
          </span>
          <IconButton
            label={`Delete ${s.title}`}
            icon={<X className="size-3.5" />}
            className="lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
            onClick={() => void actions.deleteTask(s)}
          />
        </div>
      ))}
      <form onSubmit={add} className="flex items-center gap-2 pl-2">
        <Plus className="size-4 text-label-tertiary" />
        <input
          aria-label="New subtask"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a subtask"
          className="h-9 flex-1 bg-transparent text-body outline-none placeholder:text-label-tertiary"
        />
      </form>
    </section>
  );
}

const STALE_LABELS: Record<string, string> = {
  stale_break_down: "broke it down",
  stale_five_minutes: "did 5 minutes",
  stale_commit: "committed to a new date",
  stale_help: "asked for help",
  stale_drop: "dropped it",
};

function FocusSummary({ taskId }: { taskId: string }) {
  const sessions = (useFocusSessions(taskId) ?? []).filter((s) => s.endedAt != null);
  if (!sessions.length) return null;
  const minutes = Math.round(sessions.reduce((sum, s) => sum + s.actualMinutes, 0));
  return (
    <p className="flex items-center gap-1.5 text-footnote text-label-secondary">
      <Timer className="size-3.5" strokeWidth={1.75} aria-hidden />
      Focused {minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`} across{" "}
      {sessions.length === 1 ? "1 session" : `${sessions.length} sessions`}
    </p>
  );
}

function describeEvent(e: TaskEvent, todayDay: string): string {
  const s = (v: string | null) => (v ? (STATUS_META[v as TaskStatus]?.label ?? v) : "none");
  const d = (v: string | null) => (v ? dayLabel(v, todayDay) : "none");
  switch (e.type) {
    case "created":
      return e.reason === "recurrence" ? "Created from a repeating task" : "Created";
    case "status":
      return `${s(e.from)} → ${s(e.to)}`;
    case "reschedule":
      return `${e.reason === "dueDate" ? "Due date" : "Scheduled"}: ${d(e.from)} → ${d(e.to)}`;
    case "skip":
      return `${e.to === "cancelled" ? "Cancelled" : `Moved ${d(e.from)} → ${d(e.to)}`}${e.reason ? ` — ${skipReasonLabel(e.reason)}` : ""}${e.reasonText ? `: ${e.reasonText}` : ""}`;
    default:
      if (e.reason?.startsWith("stale_")) return `Stale resolved — ${STALE_LABELS[e.reason] ?? "resolved"}`;
      return "Edited";
  }
}

function History({ taskId, todayDay }: { taskId: string; todayDay: string }) {
  const events = useTaskEvents(taskId) ?? [];
  if (!events.length) return null;
  return (
    <section aria-label="History" className="flex flex-col gap-1.5">
      <h3 className="text-footnote font-medium text-label-secondary">History</h3>
      <ol className="flex flex-col gap-1 border-l border-separator pl-3">
        {events.slice(0, 12).map((e) => (
          <li key={e.id} className="text-footnote text-label-secondary">
            <span className="text-label">{describeEvent(e, todayDay)}</span> ·{" "}
            {new Date(e.at).toLocaleString(undefined, {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </li>
        ))}
      </ol>
    </section>
  );
}
