"use client";

import { motion } from "motion/react";
import type { BurnUpPoint } from "@/features/cycles/model";
import { dayLabel, type Day } from "@/lib/dates";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/**
 * PRD CYC-3: burn-up chart. The dashed line is the scope (committed plus anything added), the
 * filled line is points done. Where they meet, the cycle is done.
 */
export function BurnUp({ points, today }: { points: BurnUpPoint[]; today: Day }) {
  const { transition } = useOrbitMotion();
  const W = 600;
  const H = 180;
  const pad = { l: 28, r: 12, t: 12, b: 24 };
  const max = Math.max(1, ...points.map((p) => p.scope), ...points.map((p) => p.done ?? 0));
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const scopePath = points.map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(p.scope)}`).join(" ");
  const doneIdx = points.map((p, i) => (p.done == null ? -1 : i)).filter((i) => i >= 0);
  const donePath = doneIdx.map((i, k) => `${k ? "L" : "M"}${x(i)} ${y(points[i].done!)}`).join(" ");
  const doneArea = doneIdx.length
    ? `${donePath} L${x(doneIdx[doneIdx.length - 1])} ${y(0)} L${x(doneIdx[0])} ${y(0)} Z`
    : "";
  const todayIdx = points.findIndex((p) => p.day === today);
  const last = doneIdx.length ? points[doneIdx[doneIdx.length - 1]] : null;
  const ticks = [0, Math.round(max / 2), max];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Burn-up: ${last?.done ?? 0} of ${points[points.length - 1]?.scope ?? 0} points done`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--separator)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--label-tertiary)">
              {t}
            </text>
          </g>
        ))}
        {todayIdx >= 0 ? (
          <line
            x1={x(todayIdx)}
            x2={x(todayIdx)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="var(--accent)"
            strokeOpacity={0.35}
            strokeDasharray="2 4"
          />
        ) : null}
        <motion.path
          d={scopePath}
          fill="none"
          stroke="var(--label-tertiary)"
          strokeWidth={2}
          strokeDasharray="5 5"
          initial={false}
          animate={{ d: scopePath }}
          transition={transition("gentle")}
        />
        {doneArea ? (
          <>
            <motion.path
              d={doneArea}
              fill="var(--accent)"
              fillOpacity={0.12}
              initial={false}
              animate={{ d: doneArea }}
              transition={transition("gentle")}
            />
            <motion.path
              d={donePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={false}
              animate={{ d: donePath }}
              transition={transition("gentle")}
            />
          </>
        ) : null}
        {last ? (
          <circle
            cx={x(doneIdx[doneIdx.length - 1])}
            cy={y(last.done!)}
            r={4.5}
            fill="var(--bg)"
            stroke="var(--accent)"
            strokeWidth={2.5}
          />
        ) : null}
        {points.length ? (
          <>
            <text x={pad.l} y={H - 6} fontSize={11} fill="var(--label-tertiary)">
              {dayLabel(points[0].day, today)}
            </text>
            <text x={W - pad.r} y={H - 6} fontSize={11} textAnchor="end" fill="var(--label-tertiary)">
              {dayLabel(points[points.length - 1].day, today)}
            </text>
          </>
        ) : null}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-footnote text-label-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-accent" /> Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-label-tertiary" /> Scope
        </span>
      </figcaption>
    </figure>
  );
}
