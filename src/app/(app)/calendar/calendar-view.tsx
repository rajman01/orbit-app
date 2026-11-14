"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/app-shell";
import { useCalendarEvents, useTimeBlocks } from "@/components/calendar/agenda";
import { BlockTimeDialog } from "@/components/calendar/block-time";
import { TASK_DRAG_TYPE, TimeGrid } from "@/components/calendar/time-grid";
import { Button, IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { blockMinutes, type TimeBlock } from "@/features/calendar/model";
import { useAllTasks, useSettings } from "@/features/data";
import { planDay } from "@/features/today/model";
import { compareTasks, isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { useSync } from "@/components/app/sync-provider";
import { cn } from "@/lib/cn";
import { addDays, weekday, type Day } from "@/lib/dates";
import { useIsDesktop } from "@/lib/use-media-query";

type View = "week" | "day";

const monthOf = (d: Day) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonth = (d: Day) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });

/** VIEW-3: the week (or one day) with calendar events, time blocks and dated tasks. */
export function CalendarView() {
  const todayDay = useToday();
  const isDesktop = useIsDesktop();
  const { weekStartDay } = useSettings();
  const engine = useSync();
  // Changes made in Google arrive on the server within seconds; while this page is open, look often.
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && engine.requestSync(), 15_000);
    return () => clearInterval(timer);
  }, [engine]);
  const [chosenView, setView] = useState<View | null>(null);
  const view: View = chosenView ?? (isDesktop ? "week" : "day");
  const [anchor, setAnchor] = useState<Day | null>(null);
  const day = anchor ?? todayDay;
  const weekStart = addDays(day, -((weekday(day) - weekStartDay + 7) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const days = view === "week" ? week : [day];

  const events = useCalendarEvents(days[0], addDays(days[days.length - 1], 1));
  const blocks = useTimeBlocks(days[0], addDays(days[days.length - 1], 1));
  const tasks = useAllTasks();

  const [slot, setSlot] = useState<number | null>(null);
  const [editing, setEditing] = useState<TimeBlock | null>(null);

  const step = view === "week" ? 7 : 1;
  const first = days[0];
  const last = days[days.length - 1];
  const title =
    first.slice(0, 7) === last.slice(0, 7)
      ? monthOf(first)
      : `${shortMonth(first)} – ${shortMonth(last)} ${last.slice(0, 4)}`;

  return (
    <>
      <PageHeader title={title} subtitle="Calendar" />
      <div className="page-enter mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-2 pb-[calc(var(--tabbar-space)+1rem)] lg:px-6">
        <div className="flex items-center gap-1 px-2 lg:px-0">
          <IconButton
            label={view === "week" ? "Previous week" : "Previous day"}
            icon={<ChevronLeft className="size-5" />}
            onClick={() => setAnchor(addDays(day, -step))}
          />
          <IconButton
            label={view === "week" ? "Next week" : "Next day"}
            icon={<ChevronRight className="size-5" />}
            onClick={() => setAnchor(addDays(day, step))}
          />
          <Button variant="ghost" onClick={() => setAnchor(null)} disabled={day === todayDay}>
            Today
          </Button>
          <span className="ml-auto">
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
              ]}
            />
          </span>
        </div>
        {view === "day" ? (
          // A strip of the week to jump between days.
          <div role="tablist" aria-label="Days" className="grid grid-cols-7 gap-1 px-1">
            {week.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === day}
                onClick={() => setAnchor(d)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md py-1.5",
                  d === day ? "bg-accent text-on-accent" : "hover:bg-fill",
                )}
              >
                <span className={cn("text-caption", d === day ? "opacity-90" : "text-label-secondary")}>
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })}
                </span>
                <span className="text-callout font-semibold tabular">{Number(d.slice(8))}</span>
                <span
                  className={cn("size-1 rounded-full", d === todayDay && d !== day ? "bg-accent" : "bg-transparent")}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-4">
          <TimeGrid
            days={days}
            events={events ?? []}
            blocks={blocks ?? []}
            tasks={tasks ?? []}
            onEmptySlot={setSlot}
            onEditBlock={setEditing}
          />
          {isDesktop ? <ToBlock days={days} blocks={blocks ?? []} /> : null}
        </div>
      </div>
      <BlockTimeDialog open={slot != null} onOpenChange={(o) => !o && setSlot(null)} at={slot ?? undefined} />
      <BlockTimeDialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)} block={editing} />
    </>
  );
}

/** Desktop: open tasks planned around these days without a block yet — drag one onto a time. */
function ToBlock({ days, blocks }: { days: Day[]; blocks: TimeBlock[] }) {
  const tasks = useAllTasks();
  const todayDay = useToday();
  const blocked = new Set(blocks.map((b) => b.taskId));
  const last = days[days.length - 1];
  const list = (tasks ?? [])
    .filter((t) => isOpen(t) && !t.parentTaskId && !blocked.has(t.id))
    .filter((t) => {
      const d = planDay(t);
      return (
        t.mustDoDate === todayDay ||
        (d != null && d <= last && d >= (days[0] < todayDay ? days[0] : todayDay)) ||
        (d != null && d < todayDay)
      );
    })
    .sort(compareTasks)
    .slice(0, 30);
  return (
    <aside aria-label="Tasks to block" className="flex w-60 shrink-0 flex-col gap-2">
      <h2 className="px-1 text-micro text-label-tertiary uppercase">To block</h2>
      {list.length ? (
        <ul className="flex flex-col gap-1">
          {list.map((t) => (
            <li
              key={t.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="flex cursor-grab items-center gap-2 rounded-md bg-surface px-2.5 py-2 text-callout shadow-1 active:cursor-grabbing"
            >
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 text-caption text-label-tertiary tabular">
                {blockMinutes(t.effort) >= 60 ? `${blockMinutes(t.effort) / 60}h` : `${blockMinutes(t.effort)}m`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-footnote text-label-secondary">
          Nothing planned for these days is waiting for time. Click an empty time to block one.
        </p>
      )}
      <p className="px-1 text-caption text-label-tertiary">Drag a task onto a time to block it.</p>
    </aside>
  );
}
