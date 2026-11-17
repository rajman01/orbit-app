"use client";

import { Flag, MapPin, Plus } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useCommands } from "@/components/app/commands";
import { DatePicker } from "@/components/tasks/pickers";
import { TaskList } from "@/components/tasks/task-list";
import { Checkbox } from "@/components/ui/checkbox";
import { useActions } from "@/features/actions";
import type { Goal, Milestone } from "@/features/goals/model";
import {
  buildRoadmap,
  dayAt,
  monthYear,
  type Roadmap,
  type RoadmapStop,
  type StopState,
} from "@/features/goals/roadmap";
import type { Task } from "@/features/tasks/model";
import { cn } from "@/lib/cn";
import { addDays, daysBetween, type Day } from "@/lib/dates";
import { useMediaQuery } from "@/lib/use-media-query";

const STATE: Record<StopState, { label: string; color: string }> = {
  done: { label: "Done", color: "var(--success)" },
  current: { label: "Up next", color: "var(--accent)" },
  behind: { label: "Behind", color: "var(--warning)" },
  upcoming: { label: "Later", color: "var(--label-tertiary)" },
};

function stopLabel(s: RoadmapStop) {
  const why = s.behind === "overdue" ? "overdue" : s.behind === "pace" ? "behind pace" : STATE[s.state].label;
  const tasks = s.total ? `, ${s.done} of ${s.total} tasks done` : "";
  return `Milestone: ${s.milestone.title}, ${monthYear(s.day)}, ${why.toLowerCase()}${tasks}`;
}

/**
 * GOAL-10: a goal's roadmap. On a computer, a winding path across the page from the start to the
 * target date, a stop at each dated milestone that can be dragged to a new date. On a phone, the
 * same journey from top to bottom. Tapping a stop opens its tasks.
 */
export function GoalRoadmap({
  goal,
  milestones,
  tasks,
  todayDay,
  createdDay,
  color,
}: {
  goal: Goal;
  milestones: Milestone[];
  tasks: Task[];
  todayDay: Day;
  createdDay: Day;
  color: string;
}) {
  const wide = useMediaQuery("(min-width: 640px)");
  const [selected, setSelected] = useState<string | null>(null);
  const road = buildRoadmap(goal, milestones, tasks, todayDay, createdDay);
  if (!road) {
    return (
      <p className="rounded-lg border border-dashed border-separator px-4 py-5 text-callout text-label-secondary">
        Give this goal a target date, or dates to its milestones, and its roadmap appears here.
      </p>
    );
  }
  const doneCount = road.stops.filter((s) => s.state === "done").length;
  const left = daysBetween(todayDay, road.end);
  const current = road.stops.find((s) => s.milestone.id === selected) ?? null;
  return (
    <section aria-label="Roadmap" className="flex flex-col gap-3">
      <p className="text-footnote text-label-secondary">
        {road.stops.length ? `${doneCount} of ${road.stops.length} milestones done · ` : ""}
        {road.hasTarget ? `Target ${monthYear(road.end)}` : `Last milestone ${monthYear(road.end)}`}
        {left > 0 ? ` · ${timeLeft(left)} to go` : left === 0 ? " · today" : ""}
      </p>
      {wide ? (
        <>
          <PathView road={road} color={color} selected={selected} onSelect={setSelected} />
          {current ? <StopCard stop={current} goal={goal} tasks={tasks} todayDay={todayDay} /> : null}
        </>
      ) : (
        <JourneyView
          road={road}
          color={color}
          todayDay={todayDay}
          selected={selected}
          onSelect={setSelected}
          goal={goal}
          tasks={tasks}
        />
      )}
      {road.undated.length ? (
        <p className="text-footnote text-label-tertiary">
          Not on the roadmap until they have a date: {road.undated.map((m) => m.title).join(", ")}.
        </p>
      ) : null}
    </section>
  );
}

function timeLeft(days: number) {
  if (days < 45) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years ${months % 12 ? `${months % 12} months` : ""}`.trim();
}

/* ---------- the winding path (computers and tablets) ---------- */

const W = 800;
const H = 250;
const X0 = 48;
const X1 = W - 48;
const MID = 128;
const point = (t: number) => ({ x: X0 + t * (X1 - X0), y: MID + 30 * Math.sin(t * Math.PI * 3 - 0.6) });
function pathD(from: number, to: number) {
  const n = Math.max(2, Math.ceil((to - from) * 90));
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = point(from + ((to - from) * i) / n);
    return `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(" ");
}
const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function PathView({
  road,
  color,
  selected,
  onSelect,
}: {
  road: Roadmap;
  color: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const actions = useActions();
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; at: number; moved: boolean; x: number } | null>(null);
  const atFrom = (e: PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return 0;
    const x = (e.clientX - m.e) / m.a;
    return Math.max(0, Math.min(1, (x - X0) / (X1 - X0)));
  };
  const today = point(road.today);
  const end = point(1);
  const startP = point(0);

  const move = (s: RoadmapStop, days: number) =>
    void actions.updateMilestone(s.milestone.id, { dueDate: addDays(s.day, days) });

  return (
    <div className="-mx-1 overflow-hidden rounded-lg border border-separator bg-surface">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none select-none"
        role="group"
        aria-label="Roadmap path"
      >
        {road.ticks.map((t) => {
          const x = point(t.at).x;
          return (
            <g key={`${t.label}${t.at}`} aria-hidden>
              <line
                x1={x}
                x2={x}
                y1={26}
                y2={H - 30}
                stroke="var(--separator)"
                strokeDasharray={t.major ? "" : "2 4"}
              />
              <text
                x={x + 4}
                y={20}
                fontSize={11}
                fill={t.major ? "var(--label-secondary)" : "var(--label-tertiary)"}
                fontWeight={t.major ? 600 : 400}
              >
                {t.label}
              </text>
            </g>
          );
        })}
        <path d={pathD(0, 1)} fill="none" stroke="var(--fill-strong)" strokeWidth={8} strokeLinecap="round" />
        {road.today > 0 ? (
          <path
            d={pathD(0, road.today)}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            opacity={0.85}
          />
        ) : null}
        {/* today */}
        <g aria-hidden>
          <line
            x1={today.x}
            x2={today.x}
            y1={today.y + 8}
            y2={H - 26}
            stroke="var(--label-secondary)"
            strokeDasharray="3 3"
          />
          <text x={today.x} y={H - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--label)">
            {road.pastEnd ? "Today (past the end)" : "You are here"}
          </text>
          <circle cx={today.x} cy={today.y} r={5} fill="var(--surface)" stroke="var(--label)" strokeWidth={2} />
        </g>
        {/* start and finish */}
        <g aria-hidden>
          <circle cx={startP.x} cy={startP.y} r={6} fill={color} />
          {road.stops.some((s) => s.at < 0.06) ? null : (
            <text x={startP.x} y={startP.y + 24} textAnchor="middle" fontSize={11} fill="var(--label-tertiary)">
              Start
            </text>
          )}
        </g>
        <g aria-label={`${road.hasTarget ? "Target" : "Last milestone"}: ${monthYear(road.end)}`} role="img">
          {road.hasTarget ? (
            <path
              d={star(end.x, end.y, 14, 6)}
              fill={color}
              stroke="var(--surface)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ) : null}
          <text x={end.x} y={end.y + 30} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--label)">
            {monthYear(road.end)}
          </text>
        </g>
        {road.stops.map((s, i) => {
          const at = drag?.id === s.milestone.id ? drag.at : s.at;
          const p = point(at);
          const above = i % 2 === 0;
          // Labels near either end lean inwards so they aren't cut off.
          const anchor = p.x < 110 ? "start" : p.x > W - 110 ? "end" : "middle";
          const lx = anchor === "start" ? Math.max(8, p.x - 14) : anchor === "end" ? Math.min(W - 8, p.x + 14) : p.x;
          const st = STATE[s.state];
          const isSel = selected === s.milestone.id;
          const dragging = drag?.id === s.milestone.id && drag.moved;
          return (
            <g
              key={s.milestone.id}
              role="button"
              tabIndex={0}
              aria-label={stopLabel(s)}
              aria-pressed={isSel}
              className="cursor-grab outline-none active:cursor-grabbing focus-visible:[&>circle:first-of-type]:stroke-[var(--accent)]"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ id: s.milestone.id, at: s.at, moved: false, x: e.clientX });
              }}
              onPointerMove={(e) => {
                if (!drag || drag.id !== s.milestone.id) return;
                const moved = drag.moved || Math.abs(e.clientX - drag.x) > 4;
                setDrag({ ...drag, moved, at: moved ? atFrom(e) : drag.at });
              }}
              onPointerUp={() => {
                if (!drag) return;
                if (drag.moved) {
                  const day = dayAt(road, drag.at);
                  if (day !== s.day) void actions.updateMilestone(s.milestone.id, { dueDate: day });
                } else onSelect(isSel ? null : s.milestone.id);
                setDrag(null);
              }}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(isSel ? null : s.milestone.id);
                } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  move(s, (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 7));
                }
              }}
            >
              <circle cx={p.x} cy={p.y} r={22} fill="transparent" stroke="none" />
              <circle
                cx={p.x}
                cy={p.y}
                r={isSel || dragging ? 13 : 11}
                fill={s.state === "upcoming" ? "var(--surface)" : st.color}
                stroke={s.state === "upcoming" ? "var(--label-tertiary)" : "var(--surface)"}
                strokeWidth={s.state === "upcoming" ? 2.5 : 3}
              />
              {s.state === "done" ? (
                <path
                  d={`M${p.x - 4.5} ${p.y} l3 3 l6 -6.5`}
                  fill="none"
                  stroke="var(--surface)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              <text
                x={lx}
                y={above ? p.y - 34 : p.y + 30}
                textAnchor={anchor}
                fontSize={12.5}
                fontWeight={isSel ? 700 : 600}
                fill="var(--label)"
              >
                {short(s.milestone.title)}
              </text>
              <text
                x={lx}
                y={above ? p.y - 19 : p.y + 45}
                textAnchor={anchor}
                fontSize={11}
                fill={s.state === "behind" ? "var(--warning-text)" : "var(--label-tertiary)"}
              >
                {dragging ? monthDay(dayAt(road, at)) : monthYear(s.day)}
                {!dragging && s.total ? ` · ${s.done}/${s.total}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="border-t border-separator px-3 py-1.5 text-caption text-label-tertiary">
        Tap a stop to see its tasks · drag it, or use the arrow keys, to change its date
      </p>
    </div>
  );
}

function monthDay(day: Day) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function star(cx: number, cy: number, r: number, inner: number) {
  return (
    Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 ? inner : r;
      return `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`;
    }).join(" ") + "Z"
  );
}

/* ---------- the journey, top to bottom (phones) ---------- */

function JourneyView({
  road,
  color,
  todayDay,
  selected,
  onSelect,
  goal,
  tasks,
}: {
  road: Roadmap;
  color: string;
  todayDay: Day;
  selected: string | null;
  onSelect: (id: string | null) => void;
  goal: Goal;
  tasks: Task[];
}) {
  // Today goes before the first stop that's still ahead of it.
  const todayIndex = road.stops.findIndex((s) => s.day > todayDay);
  const here = todayIndex === -1 ? road.stops.length : todayIndex;
  const rows: ({ kind: "stop"; stop: RoadmapStop } | { kind: "today" })[] = [];
  road.stops.forEach((stop, i) => {
    if (i === here) rows.push({ kind: "today" });
    rows.push({ kind: "stop", stop });
  });
  if (here === road.stops.length) rows.push({ kind: "today" });
  let year = "";
  return (
    <ol className="relative flex flex-col" aria-label="Roadmap stops">
      {/* the line: walked so far in the area's colour, the rest grey */}
      <span className="absolute top-3 bottom-6 left-[15px] w-1 rounded-full bg-fill-strong" aria-hidden />
      <span
        className="absolute top-3 left-[15px] w-1 rounded-full"
        style={{ background: color, height: `calc(${(here / Math.max(1, rows.length)) * 100}% )` }}
        aria-hidden
      />
      {rows.map((row) => {
        if (row.kind === "today") {
          return (
            <li key="today" className="relative flex items-center gap-3 py-2">
              <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 border-label bg-surface">
                <MapPin className="size-4" aria-hidden />
              </span>
              <span className="text-footnote font-semibold">
                {road.pastEnd ? "Today, past the end" : "You are here"}
              </span>
            </li>
          );
        }
        const s = row.stop;
        const y = s.day.slice(0, 4);
        const newYear = y !== year;
        year = y;
        const st = STATE[s.state];
        const open = selected === s.milestone.id;
        return (
          <li key={s.milestone.id} className="relative">
            {newYear ? (
              <p className="relative z-10 ml-11 pt-2 text-micro font-semibold text-label-tertiary uppercase">{y}</p>
            ) : null}
            <button
              type="button"
              aria-label={stopLabel(s)}
              aria-expanded={open}
              onClick={() => onSelect(open ? null : s.milestone.id)}
              className="flex w-full items-center gap-3 rounded-lg py-2 pr-2 text-left active:bg-fill"
            >
              <span
                className="z-10 grid size-8 shrink-0 place-items-center rounded-full border-[3px]"
                style={{
                  borderColor: s.state === "upcoming" ? "var(--label-tertiary)" : st.color,
                  background: s.state === "upcoming" ? "var(--surface)" : st.color,
                }}
              >
                {s.state === "done" ? (
                  <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                    <path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="var(--surface)"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                    />
                  </svg>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium">{s.milestone.title}</span>
                <span
                  className={cn(
                    "block text-footnote",
                    s.state === "behind" ? "text-warning-text" : "text-label-secondary",
                  )}
                >
                  {monthYear(s.day)} · {s.behind === "overdue" ? "Overdue" : st.label}
                  {s.total ? ` · ${s.done} of ${s.total} tasks` : ""}
                </span>
              </span>
            </button>
            {open ? (
              <div className="ml-11 pb-2">
                <StopCard stop={s} goal={goal} tasks={tasks} todayDay={todayDay} inline />
              </div>
            ) : null}
          </li>
        );
      })}
      <li className="relative flex items-center gap-3 py-2">
        <span
          className="z-10 grid size-8 shrink-0 place-items-center rounded-full text-on-accent"
          style={{ background: color }}
        >
          <Flag className="size-4" aria-hidden />
        </span>
        <span className="text-body font-semibold">
          {road.hasTarget ? goal.title : "Last milestone"}
          <span className="block text-footnote font-normal text-label-secondary">{monthYear(road.end)}</span>
        </span>
      </li>
    </ol>
  );
}

/* ---------- one stop's details ---------- */

function StopCard({
  stop,
  goal,
  tasks,
  todayDay,
  inline = false,
}: {
  stop: RoadmapStop;
  goal: Goal;
  tasks: Task[];
  todayDay: Day;
  inline?: boolean;
}) {
  const actions = useActions();
  const { openQuickAdd } = useCommands();
  const m = stop.milestone;
  const own = tasks.filter((t) => t.milestoneId === m.id);
  const st = STATE[stop.state];
  return (
    <div
      role="region"
      aria-label={`Milestone ${m.title}`}
      className={cn("flex flex-col gap-2 rounded-lg bg-surface", !inline && "border border-separator p-3")}
    >
      {inline ? null : (
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: st.color }} aria-hidden />
          <h3 className="min-w-0 flex-1 truncate text-headline">{m.title}</h3>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center text-footnote">
          <Checkbox
            checked={m.doneAt != null}
            onChange={(d) => void actions.toggleMilestone(m.id, d)}
            label={`Milestone done: ${m.title}`}
            shape="square"
            color="var(--success)"
          />
          <span aria-hidden className="-ml-1 pr-1">
            Done
          </span>
        </span>
        <DatePicker
          label="Milestone date"
          placeholder="Date"
          value={m.dueDate}
          todayDay={todayDay}
          onChange={(d) => void actions.updateMilestone(m.id, { dueDate: d })}
        />
        <span className={cn("text-footnote", stop.state === "behind" ? "text-warning-text" : "text-label-secondary")}>
          {stop.total ? `${stop.done} of ${stop.total} tasks done` : "No tasks yet"}
          {stop.behind === "overdue" ? " · overdue" : stop.behind === "pace" ? " · behind pace for its date" : ""}
        </span>
      </div>
      {stop.total ? (
        <span className="h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
          <span
            className="block h-full rounded-full"
            style={{ width: `${(stop.done / stop.total) * 100}%`, background: st.color }}
          />
        </span>
      ) : null}
      {own.length ? <TaskList tasks={own} showGoal={false} /> : null}
      <button
        type="button"
        onClick={() => openQuickAdd({ goalId: goal.id, areaId: goal.areaId, milestoneId: m.id, status: "todo" })}
        className="flex h-9 items-center gap-2 self-start rounded-md px-2 text-footnote font-medium text-accent-text hover:bg-fill"
      >
        <Plus className="size-4" /> Add a task to this milestone
      </button>
    </div>
  );
}
