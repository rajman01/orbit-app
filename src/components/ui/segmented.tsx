"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

/** iOS-style segmented control; the selected thumb slides with spring.snappy. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
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
          className="relative h-8 min-w-20 rounded-[8px] px-3 text-footnote font-medium lg:h-7"
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
