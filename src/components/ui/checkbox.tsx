"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { timing } from "@/lib/motion/springs";

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
  const { transition } = useOrbitMotion();
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.9 }}
      transition={timing.press}
      className="relative grid size-11 shrink-0 place-items-center lg:size-7"
    >
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
