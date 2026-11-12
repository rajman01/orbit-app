"use client";

import { Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCurrentUser } from "@/components/app/auth-gate";
import { useFocus } from "@/components/focus/focus-mode";
import { useTaskLookups } from "@/components/tasks/task-list";
import { areaColorVar } from "@/features/areas/model";
import type { Task } from "@/features/tasks/model";
import { greeting, type TodayPlan } from "@/features/today/model";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

const STARS: [number, number, number, number][] = [
  [8, 14, 1.2, 0],
  [22, 93, 0.9, 1.1],
  [36, 7, 1, 2.3],
  [48, 86, 1.3, 0.6],
  [58, 12, 0.8, 1.8],
  [67, 55, 1.1, 2.9],
  [76, 90, 0.9, 0.3],
  [88, 22, 1.2, 1.5],
  [95, 64, 0.8, 2.1],
  [3, 50, 0.7, 2.6],
  [52, 94, 0.7, 0.9],
  [82, 44, 0.7, 1.9],
];

const SPARKS: [number, number, number][] = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * 2 * Math.PI + 0.2;
  const d = 52 + (i % 3) * 14;
  return [Math.round(d * Math.cos(a)), Math.round(d * Math.sin(a)), 1.5 + (i % 2)];
});

/**
 * Today's header: the day as a small solar system. Must-dos orbit close, everything else
 * further out; a moon fills in when its task is done. Also names the next task, with a
 * one-tap Start (PRD TODAY-4) — the fastest way from opening Orbit to doing something.
 */
export function DayOrbit({
  plan,
  now,
  timezone,
  ready,
}: {
  plan: TodayPlan;
  now: number;
  timezone: string;
  /** Tasks have loaded; celebrations only play for changes after this. */
  ready: boolean;
}) {
  const { reduced } = useOrbitMotion();
  const mustDone = plan.mustDos.length > 0 && plan.mustDos.every((t) => t.status === "done");
  const user = useCurrentUser();
  const focus = useFocus();
  const open = [...plan.mustDos, ...plan.also].filter((t) => t.status !== "done");
  const total = plan.mustDos.length + plan.also.length + plan.doneToday.length;
  const done = total - open.length;
  const next = open[0];
  const allDone = total > 0 && open.length === 0;
  const firstName = user.name?.trim().split(/\s+/)[0];

  const headline = !total
    ? "A clear sky. What matters today?"
    : allDone
      ? "Everything's in orbit. Day done."
      : mustDone
        ? `${plan.mustDos.length === 1 ? "Your Must-do is" : `All ${plan.mustDos.length} Must-dos are`} done. The rest is a bonus.`
        : done === 0
          ? `${total} ${total === 1 ? "task" : "tasks"} lined up for today.`
          : `${done} of ${total} done. Keep it moving.`;

  return (
    <section
      aria-label="Today at a glance"
      className="relative mb-5 flex items-center gap-3 overflow-hidden rounded-2xl px-5 py-4 text-white shadow-2"
      style={{ background: "linear-gradient(135deg, var(--band-from), var(--band-to) 55%, #0b3c52)" }}
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden preserveAspectRatio="none">
        {STARS.map(([x, y, r, delay], i) => (
          <circle
            key={i}
            cx={`${x}%`}
            cy={`${y}%`}
            r={r}
            fill="white"
            className="twinkle"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </svg>

      {/* Finishing the last Must-do sends a shooting star across the card. */}
      {ready && !reduced ? (
        <AnimatePresence initial={false}>
          {mustDone ? (
            <motion.span
              key="shooting-star"
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 h-0.5 w-24 rounded-full"
              style={{ background: "linear-gradient(90deg, transparent, white)", rotate: 18 }}
              initial={{ x: "-30%", y: 8, opacity: 0 }}
              animate={{ x: ["-30%", "480%"], y: [8, 150], opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut", delay: 0.15 }}
            />
          ) : null}
        </AnimatePresence>
      ) : null}

      <div className="relative min-w-0 flex-1">
        <p className="text-footnote font-medium text-white/75">
          {greeting(now, timezone)}
          {firstName ? `, ${firstName}` : ""}
        </p>
        <p className="mt-0.5 text-title3 text-balance">{headline}</p>
        {next ? (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void focus.start(next)}
              aria-label={`Start next task: ${next.title}`}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-footnote font-semibold text-[var(--accent-on-white)] shadow-1 active:scale-[0.97]"
            >
              <Play className="size-3.5" fill="currentColor" aria-hidden /> Start
            </button>
            <p className="min-w-0 truncate text-footnote text-white/85">
              <span className="text-white/60">Next:</span> {next.title}
            </p>
          </div>
        ) : null}
      </div>

      <OrbitScene
        plan={plan}
        done={done}
        total={total}
        allDone={allDone}
        celebrate={ready && !reduced ? mustDone : null}
      />
    </section>
  );
}

function OrbitScene({
  plan,
  done,
  total,
  allDone,
  celebrate,
}: {
  plan: TodayPlan;
  done: number;
  total: number;
  allDone: boolean;
  /** null until tasks have loaded (or when motion is reduced); then whether all Must-dos are done. */
  celebrate: boolean | null;
}) {
  const { areaById } = useTaskLookups();
  const { transition } = useOrbitMotion();
  const inner = plan.mustDos;
  const outer = [...plan.also, ...plan.doneToday].slice(0, 10);
  const C = 70;

  const moon = (t: Task, i: number, n: number, r: number, size: number, offset: number) => {
    const a = offset + (i / Math.max(n, 1)) * 2 * Math.PI;
    const isDone = t.status === "done";
    const color = t.areaId ? areaColorVar(areaById.get(t.areaId)?.color) : "white";
    return (
      <g key={t.id} transform={`translate(${C + r * Math.cos(a)} ${C + r * Math.sin(a)})`}>
        {isDone ? <circle r={size + 3} fill="white" opacity={0.18} /> : null}
        <motion.circle
          r={size}
          initial={false}
          animate={{ scale: isDone ? 1 : 0.85, fill: isDone ? "#ffffff" : "rgba(255,255,255,0.12)" }}
          transition={transition("momentum")}
          stroke={isDone ? "white" : color === "white" ? "rgba(255,255,255,0.9)" : color}
          strokeWidth={isDone ? 0 : 2}
        />
      </g>
    );
  };

  return (
    <svg viewBox="0 0 140 140" className="relative size-28 shrink-0 overflow-visible sm:size-36" aria-hidden>
      <defs>
        <radialGradient id="day-planet" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#bdf3f7" />
          <stop offset="100%" stopColor="#5fd0dc" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={38} fill="none" stroke="white" strokeOpacity={0.28} strokeWidth={1} />
      <circle
        cx={C}
        cy={C}
        r={60}
        fill="none"
        stroke="white"
        strokeOpacity={0.2}
        strokeWidth={1}
        strokeDasharray="2 5"
      />
      {allDone ? <circle cx={C} cy={C} r={30} fill="white" opacity={0.16} /> : null}
      <motion.circle
        cx={C}
        cy={C}
        r={22}
        fill="url(#day-planet)"
        initial={false}
        animate={{ scale: allDone ? 1.08 : 1 }}
        transition={transition("momentum")}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      {allDone ? (
        <path
          d={`M${C - 8} ${C + 1} l6 6 l11 -13`}
          fill="none"
          stroke="#0b6272"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : total ? (
        <text x={C} y={C + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#0b6272" className="tabular">
          {done}/{total}
        </text>
      ) : null}
      {celebrate != null ? (
        <AnimatePresence initial={false}>
          {celebrate ? (
            <motion.g key="burst" exit={{ opacity: 0 }}>
              <motion.circle
                cx={C}
                cy={C}
                fill="none"
                stroke="white"
                strokeWidth={2}
                initial={{ r: 22, opacity: 0.8 }}
                animate={{ r: 68, opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
              {SPARKS.map(([dx, dy, size], i) => (
                <motion.circle
                  key={i}
                  r={size}
                  fill={i % 3 === 0 ? "#ffe9a8" : "white"}
                  initial={{ cx: C, cy: C, opacity: 1 }}
                  animate={{ cx: C + dx, cy: C + dy, opacity: 0 }}
                  transition={{ duration: 1 + (i % 4) * 0.12, ease: [0.2, 0.8, 0.2, 1] }}
                />
              ))}
            </motion.g>
          ) : null}
        </AnimatePresence>
      ) : null}
      <g className="orbit-spin" style={{ ["--orbit-duration" as string]: "80s" }}>
        {inner.map((t, i) => moon(t, i, inner.length, 38, 6.5, -Math.PI / 2))}
      </g>
      <g className="orbit-spin-reverse" style={{ ["--orbit-duration" as string]: "130s" }}>
        {outer.map((t, i) => moon(t, i, outer.length, 60, 4, Math.PI / 5))}
      </g>
    </svg>
  );
}
