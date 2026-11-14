"use client";

import { useEffect, useRef, useState } from "react";
import { useTaskPanel } from "@/components/tasks/task-panel";
import { useActions } from "@/features/actions";
import { atMinutes, blockMinutes, onDay, placeOnDay, SNAP_MINUTES, type TimeBlock } from "@/features/calendar/model";
import { useSettings } from "@/features/data";
import { planDay } from "@/features/today/model";
import { isOpen, type Task } from "@/features/tasks/model";
import { useMinuteNow, useToday } from "@/features/use-today";
import { cn } from "@/lib/cn";
import { dayOf, minutesOfDay, weekday, type Day } from "@/lib/dates";
import { clock, type ShownEvent } from "./agenda";

/** Height of one hour on the grid. */
export const HOUR_PX = 48;
const MIN_PX = HOUR_PX / 60;
/** Drag data type for a task dragged onto the grid (desktop). */
export const TASK_DRAG_TYPE = "application/x-orbit-task";

type Item = { kind: "event"; event: ShownEvent } | { kind: "block"; block: TimeBlock };

const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
const hourLabel = (h: number) =>
  new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString(undefined, { hour: "numeric", timeZone: "UTC" });

interface Gesture {
  id: string;
  mode: "move" | "resize";
  pointerId: number;
  x0: number;
  y0: number;
  start0: number;
  end0: number;
  moved: boolean;
}

/**
 * VIEW-3: a day or week of time. Events are read-only; time blocks can be dragged to move, their
 * bottom edge dragged to resize, and tapped to edit. Tapping empty time starts "Block time" there.
 */
export function TimeGrid({
  days,
  events,
  blocks,
  tasks,
  onEmptySlot,
  onEditBlock,
}: {
  days: Day[];
  events: ShownEvent[];
  blocks: TimeBlock[];
  tasks: Task[];
  onEmptySlot: (at: number) => void;
  onEditBlock: (block: TimeBlock) => void;
}) {
  const { timezone, workingHours } = useSettings();
  const actions = useActions();
  const panel = useTaskPanel();
  const todayDay = useToday();
  const now = useMinuteNow();
  const scroller = useRef<HTMLDivElement>(null);
  const columns = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<{ id: string; start: number; end: number } | null>(null);
  const [dropAt, setDropAt] = useState<{ day: Day; minutes: number } | null>(null);

  // Open at the start of the working day (or a little before now, if that's later).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const [wh] = workingHours.start.split(":").map(Number);
    const nowMin = minutesOfDay(Date.now(), timezone);
    const target = Math.max((wh - 0.5) * 60, days.includes(dayOf(Date.now(), timezone)) ? nowMin - 120 : 0);
    el.scrollTop = Math.max(0, target * MIN_PX);
    // Only on first show: later navigation keeps the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownBlocks = blocks.map((b) => (drag?.id === b.id ? { ...b, start: drag.start, end: drag.end } : b));
  const items: (Item & { start: number; end: number })[] = [
    ...events.filter((e) => !e.allDay).map((e) => ({ kind: "event" as const, event: e, start: e.start, end: e.end })),
    ...shownBlocks.map((b) => ({ kind: "block" as const, block: b, start: b.start, end: b.end })),
  ];

  const [whStart, whEnd] = [workingHours.start, workingHours.end].map((t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  });

  const onBlockDown = (e: React.PointerEvent, b: TimeBlock, mode: Gesture["mode"]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = {
      id: b.id,
      mode,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      start0: b.start,
      end0: b.end,
      moved: false,
    };
  };
  const onBlockMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    g.moved = true;
    const dMin = snap(dy / MIN_PX) * 60_000;
    const width = (columns.current?.clientWidth ?? 1) / days.length;
    const dDays = g.mode === "move" && days.length > 1 ? Math.round(dx / width) : 0;
    if (g.mode === "move") {
      const shift = dMin + dDays * 86_400_000;
      setDrag({ id: g.id, start: g.start0 + shift, end: g.end0 + shift });
    } else {
      setDrag({ id: g.id, start: g.start0, end: Math.max(g.start0 + SNAP_MINUTES * 60_000, g.end0 + dMin) });
    }
  };
  const onBlockUp = async (e: React.PointerEvent, b: TimeBlock) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (!g.moved) {
      setDrag(null);
      onEditBlock(b);
      return;
    }
    if (drag && (drag.start !== g.start0 || drag.end !== g.end0))
      await actions.moveTimeBlock(b.id, drag.start, drag.end);
    setDrag(null);
  };
  const cancel = () => {
    gesture.current = null;
    setDrag(null);
  };

  const slotFrom = (e: React.MouseEvent | React.DragEvent, day: Day) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const minutes = Math.floor((e.clientY - rect.top) / MIN_PX / 30) * 30;
    return { day, minutes: Math.min(Math.max(0, minutes), 24 * 60 - 30) };
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-surface shadow-1">
      {/* Day headers and all-day items */}
      <div
        className="grid border-b border-separator"
        style={{ gridTemplateColumns: `3rem repeat(${days.length}, 1fr)` }}
      >
        <div />
        {days.map((d) => {
          const isToday = d === todayDay;
          const allDay = events.filter((e) => e.allDay && onDay(e, d, timezone));
          const dated = tasks.filter((t) => isOpen(t) && !t.parentTaskId && planDay(t) === d);
          return (
            <div key={d} className="flex min-w-0 flex-col gap-1 border-l border-separator px-1 pt-2 pb-1.5">
              <div className={cn("flex items-baseline justify-center gap-1", days.length === 1 && "sr-only")}>
                <span className="text-footnote text-label-secondary">
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}
                </span>
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-callout font-semibold tabular",
                    isToday && "bg-accent text-on-accent",
                    weekday(d) % 6 === 0 && !isToday && "text-label-secondary",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              </div>
              {allDay.map((e) => (
                <span
                  key={e.id}
                  title={e.title}
                  className="truncate rounded-[5px] px-1.5 py-0.5 text-caption font-medium"
                  style={{ background: `color-mix(in srgb, ${e.color} 22%, transparent)` }}
                >
                  {e.title}
                </span>
              ))}
              {dated.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => panel.open(t.id)}
                  title={`${t.title} — drag onto a time to block it`}
                  className="flex items-center gap-1 truncate rounded-[5px] border border-separator px-1.5 py-0.5 text-left text-caption hover:bg-fill"
                >
                  <span className="size-2 shrink-0 rounded-full border border-label-tertiary" aria-hidden />
                  <span className="truncate">{t.title}</span>
                </button>
              ))}
              {dated.length > 4 ? (
                <span className="px-1.5 text-caption text-label-tertiary">+{dated.length - 4} more</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* The day(s) of time */}
      <div
        ref={scroller}
        className="relative overflow-y-auto overscroll-contain"
        style={{ height: "calc(100dvh - 15.5rem - var(--tabbar-space))", minHeight: 320 }}
      >
        <div className="grid" style={{ gridTemplateColumns: `3rem 1fr`, height: 24 * HOUR_PX }}>
          <div className="relative" aria-hidden>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-caption text-label-tertiary tabular"
                style={{ top: h * HOUR_PX }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>
          <div
            ref={columns}
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${days.length}, 1fr)`,
              backgroundImage: `repeating-linear-gradient(to bottom, var(--color-separator) 0 1px, transparent 1px ${HOUR_PX}px)`,
            }}
          >
            {days.map((d) => {
              const placed = placeOnDay(items, d, timezone);
              const isToday = d === todayDay;
              return (
                <div
                  key={d}
                  role="group"
                  aria-label={new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  })}
                  className="relative border-l border-separator"
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const s = slotFrom(e, d);
                    onEmptySlot(atMinutes(s.day, s.minutes, timezone));
                  }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    const s = slotFrom(e, d);
                    if (dropAt?.day !== s.day || dropAt.minutes !== s.minutes) setDropAt(s);
                  }}
                  onDragLeave={() => setDropAt(null)}
                  onDrop={async (e) => {
                    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
                    setDropAt(null);
                    const t = tasks.find((x) => x.id === id);
                    if (!t) return;
                    e.preventDefault();
                    const s = slotFrom(e, d);
                    const start = atMinutes(s.day, s.minutes, timezone);
                    await actions.blockTime({
                      taskId: t.id,
                      title: t.title,
                      start,
                      end: start + blockMinutes(t.effort) * 60_000,
                    });
                  }}
                >
                  {/* Outside working hours, a little dimmer. */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 bg-fill/40"
                    style={{ height: whStart * MIN_PX }}
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-fill/40"
                    style={{ top: whEnd * MIN_PX }}
                    aria-hidden
                  />
                  {dropAt?.day === d ? (
                    <div
                      className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-accent"
                      style={{ top: dropAt.minutes * MIN_PX, height: 60 * MIN_PX }}
                      aria-hidden
                    />
                  ) : null}
                  {placed.map((p) => {
                    const style = {
                      top: p.top * MIN_PX + 1,
                      height: Math.max((p.bottom - p.top) * MIN_PX - 2, 18),
                      left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                      width: `calc(${100 / p.cols}% - 4px)`,
                    };
                    const short = p.bottom - p.top < 45;
                    if (p.item.kind === "event") {
                      const e = p.item.event;
                      return (
                        <div
                          key={e.id}
                          title={`${e.title} · ${clock(e.start, timezone)}–${clock(e.end, timezone)}`}
                          className={cn(
                            "absolute overflow-hidden rounded-[6px] border-l-[3px] px-1.5 py-0.5 text-caption leading-tight",
                            e.status === "tentative" && "border-dashed",
                            e.end <= now && "opacity-60",
                          )}
                          style={{
                            ...style,
                            borderColor: e.color,
                            background: `color-mix(in srgb, ${e.color} 18%, var(--color-surface))`,
                          }}
                        >
                          <span className="block truncate font-semibold">{e.title}</span>
                          {!short ? (
                            <span className="block truncate text-label-secondary">
                              {clock(e.start, timezone)}
                              {e.location ? ` · ${e.location}` : ""}
                            </span>
                          ) : null}
                        </div>
                      );
                    }
                    const b = p.item.block;
                    const dragging = drag?.id === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-label={`Time block: ${b.title}, ${clock(b.start, timezone)} to ${clock(b.end, timezone)}`}
                        onClick={(e) => e.detail === 0 && onEditBlock(b)}
                        onPointerDown={(e) => onBlockDown(e, b, "move")}
                        onPointerMove={onBlockMove}
                        onPointerUp={(e) => void onBlockUp(e, b)}
                        onPointerCancel={cancel}
                        className={cn(
                          "absolute cursor-grab touch-none overflow-hidden rounded-[6px] bg-accent px-1.5 py-0.5 text-left text-caption leading-tight text-on-accent select-none",
                          dragging ? "z-10 cursor-grabbing shadow-2 ring-2 ring-accent/40" : "shadow-1",
                          b.end <= now && !dragging && "opacity-60",
                        )}
                        style={style}
                      >
                        <span className="block truncate font-semibold">{b.title}</span>
                        {!short ? (
                          <span className="block truncate opacity-85">
                            {clock(b.start, timezone)} – {clock(b.end, timezone)}
                          </span>
                        ) : null}
                        {/* Bottom edge: drag to change the length. */}
                        <span
                          aria-hidden
                          onPointerDown={(e) => onBlockDown(e, b, "resize")}
                          onPointerMove={onBlockMove}
                          onPointerUp={(e) => void onBlockUp(e, b)}
                          onPointerCancel={cancel}
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        />
                      </button>
                    );
                  })}
                  {isToday ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      style={{ top: minutesOfDay(now, timezone) * MIN_PX }}
                      aria-hidden
                    >
                      <span className="-ml-1 size-2 rounded-full bg-danger" />
                      <span className="h-px flex-1 bg-danger" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
