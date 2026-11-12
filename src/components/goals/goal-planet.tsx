"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

const mix = (c: string, pct: number, base = "transparent") => `color-mix(in srgb, ${c} ${pct}%, ${base})`;

/**
 * A goal as a planet: it grows as the goal progresses, the ring around it is the progress
 * arc, and each milestone is a moon that fills in when it's reached. At 100% a flag is planted.
 */
export function GoalPlanet({
  progress,
  color,
  milestones = [],
  label,
  size = 112,
  follow = false,
}: {
  /** Track `progress` directly (no easing) — for when something continuous like scrolling drives it. */
  follow?: boolean;
  progress: number; // 0..1
  color: string;
  milestones?: { id: string; done: boolean }[];
  label: string;
  size?: number;
}) {
  const { transition } = useOrbitMotion();
  const id = useId();
  const p = Math.max(0, Math.min(1, progress));
  const smooth = follow ? { duration: 0 } : transition("gentle");
  const C = 60;
  const complete = p >= 1;
  const moons = milestones.slice(0, 8);

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label} className="overflow-visible">
      <defs>
        <radialGradient id={`${id}-body`} cx="35%" cy="30%" r="85%">
          <stop offset="0%" style={{ stopColor: mix(color, 35, "white") }} />
          <stop offset="60%" style={{ stopColor: color }} />
          <stop offset="100%" style={{ stopColor: mix(color, 70, "black") }} />
        </radialGradient>
      </defs>

      {/* progress ring */}
      <circle cx={C} cy={C} r={54} fill="none" stroke="var(--fill)" strokeWidth={5} />
      <motion.circle
        cx={C}
        cy={C}
        r={54}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        transform={`rotate(-90 ${C} ${C})`}
        initial={false}
        animate={{ pathLength: p }}
        transition={smooth}
      />

      {/* milestone moons */}
      {moons.length ? (
        <>
          <circle cx={C} cy={C} r={41} fill="none" stroke="var(--fill-strong)" strokeWidth={1} strokeDasharray="2 5" />
          <g className="orbit-spin" style={{ ["--orbit-duration" as string]: "100s" }}>
            {moons.map((m, i) => {
              const a = -Math.PI / 2 + (i / moons.length) * 2 * Math.PI;
              return (
                <motion.circle
                  key={m.id}
                  cx={C + 41 * Math.cos(a)}
                  cy={C + 41 * Math.sin(a)}
                  r={4.5}
                  strokeWidth={2}
                  stroke={color}
                  initial={false}
                  animate={{ fill: m.done ? color : "var(--bg)", scale: m.done ? 1.15 : 1 }}
                  transition={transition("momentum")}
                />
              );
            })}
          </g>
        </>
      ) : null}

      {/* the planet */}
      {complete ? <circle cx={C} cy={C} r={36} fill={mix(color, 18)} /> : null}
      <motion.g
        initial={false}
        animate={{ scale: 0.45 + 0.55 * p }}
        transition={smooth}
        style={{ transformOrigin: `${C}px ${C}px`, transformBox: "view-box" }}
      >
        <circle cx={C} cy={C} r={28} fill={`url(#${id}-body)`} />
        <circle cx={C - 9} cy={C + 6} r={5} fill="black" opacity={0.12} />
        <circle cx={C + 10} cy={C - 4} r={3.5} fill="black" opacity={0.1} />
        <circle cx={C + 4} cy={C + 14} r={2.5} fill="black" opacity={0.1} />
        {complete ? (
          <>
            <line x1={C} y1={C - 27} x2={C} y2={C - 46} stroke="var(--label)" strokeWidth={2} strokeLinecap="round" />
            <path d={`M${C + 1} ${C - 46} l14 4.5 l-14 5 Z`} fill="var(--accent)" />
          </>
        ) : null}
      </motion.g>
    </svg>
  );
}
