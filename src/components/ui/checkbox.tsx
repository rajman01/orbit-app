"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { timing } from "@/lib/motion/springs";

const BURST: [number, number][] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * 2 * Math.PI + 0.4;
  return [Math.round(20 * Math.cos(a)), Math.round(20 * Math.sin(a))];
});

/** DESIGN.md §11.3 — circle fills and the check draws in with spring.snappy. */
export function Checkbox({
  checked,
  onChange,
  label,
  shape = "circle",
  color = "var(--success)",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  shape?: "circle" | "square";
  color?: string;
}) {
  const { transition, reduced } = useOrbitMotion();
  // A small burst when the user completes something (not when it loads already done).
  const [burst, setBurst] = useState(0);
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        if (!checked && !reduced) setBurst((b) => b + 1);
        onChange(!checked);
      }}
      whileTap={{ scale: 0.9 }}
      transition={timing.press}
      className="relative grid size-11 shrink-0 place-items-center lg:size-7"
    >
      <AnimatePresence>
        {burst && checked ? (
          <span key={burst} className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
            <motion.span
              className="absolute size-[22px] rounded-full border-2 lg:size-[18px]"
              style={{ borderColor: color }}
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            {BURST.map(([dx, dy], i) => (
              <motion.span
                key={i}
                className="absolute size-1 rounded-full"
                style={{ backgroundColor: i % 2 ? "var(--accent)" : color }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: dx, y: dy, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
              />
            ))}
          </span>
        ) : null}
      </AnimatePresence>
      <motion.span
        className={cn(
          "grid size-[22px] place-items-center border-[1.5px] lg:size-[18px]",
          shape === "circle" ? "rounded-full" : "rounded-xs",
        )}
        initial={false}
        animate={{
          backgroundColor: checked ? color : "rgba(0,0,0,0)",
          borderColor: checked ? color : "var(--label-tertiary)",
        }}
        transition={transition("snappy")}
      >
        <svg viewBox="0 0 16 16" className="size-3 lg:size-2.5" aria-hidden>
          <motion.path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={transition("snappy")}
          />
        </svg>
      </motion.span>
    </motion.button>
  );
}
