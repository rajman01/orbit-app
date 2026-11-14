"use client";

import { Plus } from "lucide-react";
import { useRef } from "react";
import { useTaskPanel } from "@/components/tasks/task-panel";
import { agenda, type TimeBlock } from "@/features/calendar/model";
import { useSettings } from "@/features/data";
import { planDay } from "@/features/today/model";
import { isOpen, type Task } from "@/features/tasks/model";
import { useMinuteNow, useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { addDays, dayOf, weekday, type Day } from "@/lib/dates";
import { useIsDesktop } from "@/lib/use-media-query";
import { BLOCK_COLOR, clock, type ShownEvent } from "./agenda";

/** The six weeks shown for the month `day` is in. */
export function monthGrid(day: Day, weekStartDay: number): Day[] {
  const first = `${day.slice(0, 7)}-01`;
  const start = addDays(first, -((weekday(first) - weekStartDay + 7) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

type Item =
  | {
      kind: "event";
      id: string;
      title: string;
      color: string;
      allDay: boolean;
      start: number;
      end: number;
      event: ShownEvent;
    }
  | {
      kind: "block";
      id: string;
      title: string;
      color: string;
      allDay: false;
      start: number;
      end: number;
      block: TimeBlock;
    }
  | { kind: "task"; id: string; title: string; color: string; allDay: true; start: number; end: number; task: Task };

/** One day's items: all-day events, then timed events and blocks by time, then dated tasks. */
function itemsOn(d: Day, events: ShownEvent[], blocks: TimeBlock[], tasks: Task[], timezone: string): Item[] {
  const timed = agenda(
    [
      ...events.map((e) => ({ ...e, kind: "event" as const })),
      ...blocks.map((b) => ({ ...b, allDay: false, startDay: null, endDay: null, kind: "block" as const })),
    ],
    d,
    timezone,
  ).map((x): Item =>
    x.kind === "event"
      ? {
          kind: "event",
          id: x.id,
          title: x.title,
          color: x.color,
          allDay: x.allDay,
          start: x.start,
          end: x.end,
          event: x,
        }
      : {
          kind: "block",
          id: x.id,
          title: x.title,
          color: BLOCK_COLOR,
          allDay: false,
          start: x.start,
          end: x.end,
          block: x as unknown as TimeBlock,
        },
  );
  const dated = tasks
    .filter((t) => isOpen(t) && !t.parentTaskId && planDay(t) === d)
    .map((t): Item => ({
      kind: "task",
      id: t.id,
      title: t.title,
      color: "var(--color-label-tertiary)",
      allDay: true,
      start: 0,
      end: 0,
      task: t,
    }));
  return [...timed, ...dated];
}

/**
 * VIEW-3 month: six weeks. Desktop cells list what's on (tap a day to open it); phones show dots
 * and the chosen day's agenda underneath.
 */
export function MonthView({
  day,
  events,
  blocks,
  tasks,
  onOpenDay,
  onPickDay,
  onEditBlock,
  onBlockAt,
  onMonth,
}: {
  /** Swipe on phones: the next (1) or previous (-1) month. */
  onMonth: (n: number) => void;
  /** The chosen day; its month is shown. */
  day: Day;
  events: ShownEvent[];
  blocks: TimeBlock[];
  tasks: Task[];
  /** Desktop: show this day in Day view. */
  onOpenDay: (d: Day) => void;
  /** Phones: choose a day (its agenda shows below). */
  onPickDay: (d: Day) => void;
  onEditBlock: (b: TimeBlock) => void;
  onBlockAt: (d: Day) => void;
}) {
  const { timezone, weekStartDay } = useSettings();
  const todayDay = useToday();
  const isDesktop = useIsDesktop();
  const grid = monthGrid(day, weekStartDay);
  const month = day.slice(0, 7);
  const names = grid.slice(0, 7).map((d) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
      weekday: isDesktop ? "short" : "narrow",
      timeZone: "UTC",
    }),
  );
  const byDay = new Map(grid.map((d) => [d, itemsOn(d, events, blocks, tasks, timezone)]));
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 pb-1.5">
        {names.map((n, i) => (
          <span key={i} className="text-center text-[11px] font-medium text-label-tertiary uppercase">
            {n}
          </span>
        ))}
      </div>
      <div
        role="grid"
        aria-label="Month"
        className={cn(
          "grid shrink-0 grid-cols-7 border-t border-l border-separator/60",
          isDesktop ? "min-h-0 flex-1 grid-rows-6" : "touch-pan-y grid-rows-6",
        )}
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (isDesktop || !s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) onMonth(dx < 0 ? 1 : -1);
        }}
      >
        {grid.map((d) => {
          const inMonth = d.startsWith(month);
          const isToday = d === todayDay;
          const selected = d === day;
          const items = byDay.get(d) ?? [];
          const label = new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          });
          const number = (
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-footnote tabular",
                isToday
                  ? "bg-accent font-semibold text-on-accent"
                  : selected && !isDesktop
                    ? "bg-label font-semibold text-bg"
                    : inMonth
                      ? "text-label"
                      : "text-label-tertiary",
              )}
            >
              {Number(d.slice(8))}
            </span>
          );
          if (!isDesktop) {
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-selected={selected}
                aria-label={`${label}${items.length ? `, ${items.length} item${items.length === 1 ? "" : "s"}` : ""}`}
                onClick={() => onPickDay(d)}
                className={cn(
                  "flex h-12 flex-col items-center gap-1 border-r border-b border-separator/60 pt-1",
                  !inMonth && "bg-fill/30",
                )}
              >
                {number}
                <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                  {items.slice(0, 3).map((it) => (
                    <span key={it.id} className="size-1.5 rounded-full" style={{ background: it.color }} />
                  ))}
                </span>
              </button>
            );
          }
          const shown = 3;
          return (
            <div
              key={d}
              role="gridcell"
              aria-label={label}
              onClick={(e) => e.target === e.currentTarget && onOpenDay(d)}
              className={cn(
                "group flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-r border-b border-separator/60 p-1 hover:bg-fill/40",
                !inMonth && "bg-fill/30",
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onOpenDay(d)}
                  aria-label={`Open ${label}`}
                  className="rounded-full"
                >
                  {number}
                </button>
                <button
                  type="button"
                  onClick={() => onBlockAt(d)}
                  aria-label={`Block time on ${label}`}
                  className="grid size-5 place-items-center rounded-full text-label-tertiary opacity-0 group-hover:opacity-100 hover:bg-fill hover:text-label focus-visible:opacity-100"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {items.slice(0, shown).map((it) => (
                <MonthItem key={it.id} item={it} timezone={timezone} onEditBlock={onEditBlock} />
              ))}
              {items.length > shown ? (
                <button
                  type="button"
                  onClick={() => onOpenDay(d)}
                  className="px-1 text-left text-[11px] font-medium text-label-secondary hover:text-label"
                >
                  +{items.length - shown} more
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {!isDesktop ? (
        <DayList
          day={day}
          items={byDay.get(day) ?? itemsOn(day, events, blocks, tasks, timezone)}
          onEditBlock={onEditBlock}
          onBlockAt={onBlockAt}
        />
      ) : null}
    </div>
  );
}

function MonthItem({
  item,
  timezone,
  onEditBlock,
}: {
  item: Item;
  timezone: string;
  onEditBlock: (b: TimeBlock) => void;
}) {
  const panel = useTaskPanel();
  if (item.kind === "event" && item.allDay) {
    return (
      <span
        title={item.title}
        className="truncate rounded-[4px] px-1 py-px text-[11px] leading-tight font-medium"
        style={{ background: `color-mix(in srgb, ${item.color} 22%, var(--color-surface))` }}
      >
        {item.title}
      </span>
    );
  }
  if (item.kind === "task") {
    return (
      <button
        type="button"
        onClick={() => panel.open(item.task.id)}
        className="flex min-w-0 items-center gap-1 rounded-[4px] px-1 text-left text-[11px] leading-tight hover:bg-fill"
      >
        <span className="size-2 shrink-0 rounded-full border border-label-tertiary" aria-hidden />
        <span className="truncate">{item.title}</span>
      </button>
    );
  }
  const body = (
    <>
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
      <span className="shrink-0 text-label-secondary tabular">{clock(item.start, timezone)}</span>
      <span className="truncate">{item.title}</span>
    </>
  );
  const cls = "flex min-w-0 items-center gap-1 rounded-[4px] px-1 text-left text-[11px] leading-tight";
  return item.kind === "block" ? (
    <button
      type="button"
      onClick={() => onEditBlock(item.block)}
      aria-label={`Time block: ${item.title}, ${clock(item.start, timezone)}`}
      className={cn(cls, "hover:bg-fill")}
    >
      {body}
    </button>
  ) : (
    <span className={cls} title={item.title}>
      {body}
    </span>
  );
}

/** Phones: the chosen day's events, blocks and tasks under the month. */
function DayList({
  day,
  items,
  onEditBlock,
  onBlockAt,
}: {
  day: Day;
  items: Item[];
  onEditBlock: (b: TimeBlock) => void;
  onBlockAt: (d: Day) => void;
}) {
  const { timezone } = useSettings();
  const panel = useTaskPanel();
  const now = useMinuteNow();
  const today = dayOf(now, timezone);
  return (
    <section aria-label="Day" className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-headline">
          {new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          })}
        </h2>
        <button
          type="button"
          onClick={() => onBlockAt(day)}
          className="flex h-8 items-center gap-1 rounded-full px-2.5 text-footnote font-semibold text-accent-text hover:bg-fill"
        >
          <Plus className="size-4" /> Block time
        </button>
      </div>
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((it) => {
            const past = !it.allDay && it.end <= now && day <= today;
            const content = (
              <>
                <span className="mt-1 h-4 w-1 shrink-0 rounded-full" style={{ background: it.color }} aria-hidden />
                <span className="w-16 shrink-0 text-footnote leading-tight text-label-secondary tabular">
                  {it.allDay ? (it.kind === "task" ? "Task" : "All day") : clock(it.start, timezone)}
                </span>
                <span className="min-w-0 flex-1 truncate text-body">{it.title}</span>
              </>
            );
            const cls = cn("flex w-full items-start gap-3 rounded-md px-1 py-2 text-left", past && "opacity-50");
            return (
              <li key={it.id}>
                {it.kind === "block" ? (
                  <button type="button" className={cn(cls, "hover:bg-fill")} onClick={() => onEditBlock(it.block)}>
                    {content}
                  </button>
                ) : it.kind === "task" ? (
                  <button type="button" className={cn(cls, "hover:bg-fill")} onClick={() => panel.open(it.task.id)}>
                    {content}
                  </button>
                ) : (
                  <div className={cls}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-callout text-label-secondary">Nothing on this day.</p>
      )}
    </section>
  );
}
