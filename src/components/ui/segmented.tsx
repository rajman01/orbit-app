"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/** iOS-style segmented control; the selected thumb slides with spring.snappy. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  compact,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  /** Narrower segments, for tight toolbars on phones. */
  compact?: boolean;
}) {
  const id = useId();
  const { transition } = useOrbitMotion();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-fill p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative h-8 rounded-[8px] text-footnote font-medium lg:h-7",
            compact ? "min-w-0 px-2.5 lg:min-w-16 lg:px-3" : "min-w-20 px-3",
          )}
        >
          {value === o.value ? (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 rounded-[8px] bg-surface-raised shadow-1 dark:bg-[#636366]"
              transition={transition("snappy")}
            />
          ) : null}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
