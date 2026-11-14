"use client";

import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { useSync } from "@/components/app/sync-provider";
import { useCalendarEvents, useTimeBlocks } from "@/components/calendar/agenda";
import { BlockTimeDialog } from "@/components/calendar/block-time";
import { TASK_DRAG_TYPE, TimeGrid } from "@/components/calendar/time-grid";
import { IconButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { blockMinutes, formatMinutes, onDay, type TimeBlock } from "@/features/calendar/model";
import { useAllTasks, useSettings } from "@/features/data";
import { planDay } from "@/features/today/model";
import { compareTasks, isOpen } from "@/features/tasks/model";
import { useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayOf, weekday, type Day } from "@/lib/dates";
import { useIsDesktop } from "@/lib/use-media-query";

type View = "week" | "day";

const fmt = (d: Day, o: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { ...o, timeZone: "UTC" });

/** VIEW-3: the week (or one day) with calendar events, time blocks and dated tasks. */
export function CalendarView() {
  const todayDay = useToday();
  const isDesktop = useIsDesktop();
  const { weekStartDay, timezone } = useSettings();
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

  // The whole week is loaded either way: the day strip shows which days have something.
  const events = useCalendarEvents(week[0], addDays(week[6], 1));
  const blocks = useTimeBlocks(week[0], addDays(week[6], 1));
  const tasks = useAllTasks();
  const busyDays = new Set<Day>([
    ...week.filter((d) => (events ?? []).some((e) => onDay(e, d, timezone))),
    ...(blocks ?? []).map((b) => dayOf(b.start, timezone)),
  ]);

  const [slot, setSlot] = useState<number | null>(null);
  const [editing, setEditing] = useState<TimeBlock | null>(null);

  const step = view === "week" ? 7 : 1;
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const month = sameMonth
    ? fmt(first, { month: isDesktop ? "long" : "short" })
    : `${fmt(first, { month: "short" })} – ${fmt(last, { month: "short" })}`;
  const year = last.slice(0, 4);

  return (
    // Fills the screen: the grid scrolls, the toolbar and strip stay put.
    <div className="page-enter mx-auto flex h-[calc(100dvh-var(--tabbar-space))] w-full max-w-[1400px] flex-col pt-[max(env(safe-area-inset-top),0.75rem)] lg:h-dvh lg:px-6 lg:pt-6">
      <header className="flex shrink-0 items-center gap-2 px-4 pb-2 lg:px-0 lg:pb-4">
        <h1 className="min-w-0 flex-1 truncate text-title1 font-bold tracking-tight lg:text-[28px]">
          {month} <span className="font-normal text-label-secondary">{year}</span>
        </h1>
        <span className="lg:hidden">
          <SyncIndicator />
        </span>
        <button
          type="button"
          onClick={() => setAnchor(null)}
          disabled={day === todayDay}
          className="h-8 rounded-full bg-fill px-3 text-footnote font-semibold text-accent-text disabled:text-label-tertiary"
        >
          Today
        </button>
        <span className="hidden items-center lg:flex">
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
        </span>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
        />
      </header>

      {view === "day" ? (
        <WeekStrip
          week={week}
          day={day}
          todayDay={todayDay}
          busyDays={busyDays}
          onPick={setAnchor}
          onWeek={(n) => setAnchor(addDays(day, n * 7))}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 gap-5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-separator/70 pt-2 lg:rounded-xl lg:border lg:bg-surface lg:pt-3 lg:shadow-1">
          <TimeGrid
            days={days}
            events={(events ?? []).filter((e) => days.some((d) => onDay(e, d, timezone)))}
            blocks={blocks ?? []}
            tasks={tasks ?? []}
            onEmptySlot={setSlot}
            onEditBlock={setEditing}
          />
        </div>
        {isDesktop ? <ToBlock days={days} blocks={blocks ?? []} /> : null}
      </div>
      <BlockTimeDialog open={slot != null} onOpenChange={(o) => !o && setSlot(null)} at={slot ?? undefined} />
      <BlockTimeDialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)} block={editing} />
    </div>
  );
}

/**
 * Phones: the week as a strip of days (swipe for the next or previous week), a dot under days that
 * have events or blocks.
 */
function WeekStrip({
  week,
  day,
  todayDay,
  busyDays,
  onPick,
  onWeek,
}: {
  week: Day[];
  day: Day;
  todayDay: Day;
  busyDays: Set<Day>;
  onPick: (d: Day) => void;
  onWeek: (n: number) => void;
}) {
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  return (
    <div className="flex shrink-0 items-center gap-0.5 px-1 pb-2">
      <IconButton
        label="Previous week"
        icon={<ChevronLeft className="size-4" />}
        onClick={() => onWeek(-1)}
        className="hidden sm:inline-flex"
      />
      <div
        role="tablist"
        aria-label="Days"
        className="grid flex-1 touch-pan-y grid-cols-7"
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) onWeek(dx < 0 ? 1 : -1);
        }}
      >
        {week.map((d) => {
          const selected = d === day;
          const isToday = d === todayDay;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={fmt(d, { weekday: "long", day: "numeric", month: "long" })}
              onClick={() => onPick(d)}
              className="flex flex-col items-center gap-1 py-1"
            >
              <span
                className={cn(
                  "text-[11px] font-medium uppercase",
                  isToday ? "text-accent-text" : "text-label-tertiary",
                )}
              >
                {fmt(d, { weekday: "narrow" })}
              </span>
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full text-[17px] tabular transition-colors",
                  selected
                    ? isToday
                      ? "bg-accent font-semibold text-on-accent"
                      : "bg-label font-semibold text-bg"
                    : isToday
                      ? "font-semibold text-accent-text"
                      : "text-label",
                )}
              >
                {Number(d.slice(8))}
              </span>
              <span
                className={cn("size-1 rounded-full", busyDays.has(d) ? "bg-label-tertiary" : "bg-transparent")}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      <IconButton
        label="Next week"
        icon={<ChevronRight className="size-4" />}
        onClick={() => onWeek(1)}
        className="hidden sm:inline-flex"
      />
    </div>
  );
}

/** Desktop: open tasks planned around these days without a block yet — drag one onto a time. */
function ToBlock({ days, blocks }: { days: Day[]; blocks: TimeBlock[] }) {
  const tasks = useAllTasks();
  const todayDay = useToday();
  const blocked = new Set(blocks.map((b) => b.taskId));
  const first = days[0] < todayDay ? days[0] : todayDay;
  const last = days[days.length - 1];
  const list = (tasks ?? [])
    .filter((t) => isOpen(t) && !t.parentTaskId && !blocked.has(t.id))
    .filter((t) => {
      const d = planDay(t);
      return t.mustDoDate === todayDay || (d != null && d <= last && (d >= first || d < todayDay));
    })
    .sort(compareTasks)
    .slice(0, 30);
  // Nothing to drag: give the days the room. (Empty slots can still be clicked to block time.)
  if (!list.length) return null;
  return (
    <aside aria-label="Tasks to block" className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto pb-6">
      <div className="px-1">
        <h2 className="text-headline">To block</h2>
        <p className="text-footnote text-label-secondary">Drag a task onto a time.</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {list.map((t) => (
          <li
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="group flex cursor-grab items-center gap-2 rounded-lg bg-surface py-2 pr-3 pl-1.5 text-callout shadow-1 transition-shadow hover:shadow-2 active:cursor-grabbing"
          >
            <GripVertical className="size-4 shrink-0 text-label-tertiary" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <span className="shrink-0 rounded-full bg-fill px-1.5 py-0.5 text-[11px] font-medium text-label-secondary tabular">
              {formatMinutes(blockMinutes(t.effort))}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
