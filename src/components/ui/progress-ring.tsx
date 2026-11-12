"use client";

import { motion } from "motion/react";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/** DESIGN.md §11.11 */
export function ProgressRing({
  value,
  size = 20,
  stroke,
  color = "var(--accent)",
  label,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const { transition } = useOrbitMotion();
  const w = stroke ?? (size >= 64 ? 6 : 3);
  const r = (size - w) / 2;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${Math.round(clamped * 100)}%`}
      className="-rotate-90"
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={w} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: clamped }}
        transition={transition("gentle")}
      />
    </svg>
  );
}
