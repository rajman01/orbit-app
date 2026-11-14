"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CalendarClock, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { atMinutes, blockMinutes, nextSlot, type TimeBlock } from "@/features/calendar/model";
import { useTaskPanel } from "@/components/tasks/task-panel";
import { useAllTasks, useSettings } from "@/features/data";
import { compareTasks, isOpen, taskCode, type Task } from "@/features/tasks/model";
import { cn } from "@/lib/cn";
import { useMinuteNow, useToday } from "@/features/use-today";
import { addDays, dayLabel, dayOf, minutesOfDay } from "@/lib/dates";
import { clock, useCalendarEvents } from "./agenda";

const LENGTHS = [
  { minutes: 30, label: "30m" },
  { minutes: 60, label: "1h" },
  { minutes: 90, label: "1½h" },
  { minutes: 120, label: "2h" },
  { minutes: 180, label: "3h" },
];

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * "Block time" (CAL-4): for a given task, or pick one (or just type a title) when started from an
 * empty slot on the calendar. Warns when the block overlaps an event.
 */
export function BlockTimeDialog({
  open,
  onOpenChange,
  task,
  at,
  block,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The task to block time for; omitted to choose one. */
  task?: Task | null;
  /** Start instant (e.g. the slot tapped on the calendar); default: the next quarter hour. */
  at?: number;
  /** An existing block to change or delete. */
  block?: TimeBlock | null;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={block ? "Time block" : "Block time"} width={440}>
      <BlockTimeForm
        key={`${task?.id ?? ""}:${at ?? ""}:${block?.id ?? ""}`}
        task={task ?? null}
        at={at}
        block={block ?? null}
        onDone={() => onOpenChange(false)}
      />
    </Modal>
  );
}

function BlockTimeForm({
  task,
  at,
  block,
  onDone,
}: {
  task: Task | null;
  at?: number;
  block: TimeBlock | null;
  onDone: () => void;
}) {
  const actions = useActions();
  const toast = useToast();
  const panel = useTaskPanel();
  const { timezone } = useSettings();
  const now = useMinuteNow();
  const from = block?.start ?? at;
  const initial =
    from != null ? { day: dayOf(from, timezone), minutes: minutesOfDay(from, timezone) } : nextSlot(now, timezone);
  const [day, setDay] = useState(initial.day);
  const [time, setTime] = useState(hhmm(initial.minutes));
  const [chosen, setChosen] = useState<Task | null>(task);
  const [length, setLength] = useState(
    block ? Math.round((block.end - block.start) / 60_000) : blockMinutes(task?.effort),
  );
  const [title, setTitle] = useState(block?.title ?? "");
  const lengths = LENGTHS.some((l) => l.minutes === length)
    ? LENGTHS
    : [
        ...LENGTHS,
        {
          minutes: length,
          label: `${Math.floor(length / 60) ? `${Math.floor(length / 60)}h` : ""}${length % 60 ? `${length % 60}m` : ""}`,
        },
      ].sort((a, b) => a.minutes - b.minutes);

  const [h, m] = time.split(":").map(Number);
  const startMin = Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  const start = startMin != null && day ? atMinutes(day, startMin, timezone) : null;
  const end = start != null ? start + length * 60_000 : null;

  const events = useCalendarEvents(day || initial.day, addDays(day || initial.day, 1));
  const clashes =
    start != null && end != null
      ? (events ?? []).filter((e) => !e.allDay && e.start < end && e.end > start).map((e) => e.title)
      : [];

  const name = block ? title.trim() : (chosen?.title ?? title.trim());
  const save = async () => {
    if (start == null || end == null || !name) return;
    if (block) {
      await actions.moveTimeBlock(block.id, start, end);
      if (name !== block.title) await actions.renameTimeBlock(block.id, name);
    } else {
      await actions.blockTime({ taskId: chosen?.id ?? null, title: name, start, end });
      toast({ message: `Blocked ${clock(start, timezone)}–${clock(end, timezone)} for “${name}”` });
    }
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {block ? (
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
      ) : task ? (
        <p className="text-body font-medium">{task.title}</p>
      ) : (
        <TaskChooser
          chosen={chosen}
          onChoose={(t) => {
            setChosen(t);
            if (t) setLength(blockMinutes(t.effort));
          }}
          title={title}
          onTitle={setTitle}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </Field>
        <Field label="Starts">
          <Input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-footnote font-medium text-label-secondary">Length</span>
        <div role="radiogroup" aria-label="Length" className="flex flex-wrap gap-1.5">
          {lengths.map((l) => (
            <button
              key={l.minutes}
              type="button"
              role="radio"
              aria-checked={length === l.minutes}
              onClick={() => setLength(l.minutes)}
              className={cn(
                "h-8 min-w-12 rounded-full px-3 text-footnote font-semibold",
                length === l.minutes ? "bg-accent text-on-accent" : "bg-fill text-label hover:bg-fill-strong",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      {start != null && end != null ? (
        <p className="text-footnote text-label-secondary">
          {clock(start, timezone)} – {clock(end, timezone)}
          {clashes.length ? (
            <span className="text-warning-text"> · Overlaps {clashes.slice(0, 2).join(", ")}</span>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" disabled={start == null || !name}>
        {block ? "Save" : "Block time"}
      </Button>
      {block ? (
        <div className="flex justify-between gap-2">
          {block.taskId ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onDone();
                panel.open(block.taskId!);
              }}
            >
              Open task
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="ghost"
            className="text-danger-text"
            onClick={() => {
              void actions.deleteTimeBlock(block.id);
              onDone();
            }}
          >
            Delete block
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/** Pick an open task, or just type what the time is for. */
function TaskChooser({
  chosen,
  onChoose,
  title,
  onTitle,
}: {
  chosen: Task | null;
  onChoose: (t: Task | null) => void;
  title: string;
  onTitle: (t: string) => void;
}) {
  const all = useAllTasks();
  const matches = useMemo(() => {
    const q = title.trim().toLowerCase();
    return (all ?? [])
      .filter((t) => isOpen(t) && !t.parentTaskId && (!q || t.title.toLowerCase().includes(q)))
      .sort(compareTasks)
      .slice(0, 6);
  }, [all, title]);

  if (chosen) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-body font-medium">{chosen.title}</span>
        <button type="button" onClick={() => onChoose(null)} className="text-footnote font-semibold text-accent-text">
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="relative">
        <span className="sr-only">What&rsquo;s the time for?</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-label-tertiary" />
        <Input
          autoFocus
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Find a task, or type what it's for"
          className="pl-9"
        />
      </label>
      {matches.length ? (
        <ul aria-label="Tasks" className="flex flex-col">
          {matches.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onChoose(t)}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-body hover:bg-fill"
              >
                <span className="font-mono text-caption text-label-tertiary">{taskCode(t)}</span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** In a task's details: its upcoming time blocks, and "Block time". */
export function TaskTimeBlocks({ task }: { task: Task }) {
  const { db } = useSync();
  const actions = useActions();
  const { timezone } = useSettings();
  const todayDay = useToday();
  const [open, setOpen] = useState(false);
  const blocks = useLiveQuery(
    async () =>
      (await db.timeBlocks.where("taskId").equals(task.id).toArray())
        .filter((b) => b.deletedAt == null && b.end > Date.parse(`${addDays(todayDay, -1)}T00:00:00Z`))
        .sort((a, b) => a.start - b.start),
    [db, task.id, todayDay],
  );
  return (
    <section aria-label="Time blocks" className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-footnote font-medium text-label-secondary">
        <CalendarClock className="size-3.5" strokeWidth={1.75} /> Time blocks
      </span>
      {(blocks ?? []).map((b) => (
        <div key={b.id} className="flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-1.5">
          <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="flex-1 text-callout tabular">
            {dayLabel(dayOf(b.start, timezone), todayDay)} · {clock(b.start, timezone)} – {clock(b.end, timezone)}
          </span>
          <IconButton
            label="Remove time block"
            icon={<X className="size-4" />}
            onClick={() => void actions.deleteTimeBlock(b.id)}
          />
        </div>
      ))}
      {isOpen(task) ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 items-center gap-1.5 self-start rounded-md px-2 text-callout font-semibold text-accent-text hover:bg-fill"
        >
          <Plus className="size-4" /> Block time
        </button>
      ) : null}
      <BlockTimeDialog open={open} onOpenChange={setOpen} task={task} />
    </section>
  );
}
