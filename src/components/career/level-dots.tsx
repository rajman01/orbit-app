"use client";

import { SKILL_LEVELS } from "@/features/career/model";
import { cn } from "@/lib/cn";

/**
 * A skill's level as five dots: filled up to the current level, ringed up to the target. With
 * `onChange`, each dot is a button that sets the level.
 */
export function LevelDots({
  level,
  target,
  onChange,
  name,
  size = "sm",
}: {
  level: number;
  target: number;
  onChange?: (level: number) => void;
  name?: string;
  size?: "sm" | "lg";
}) {
  const dot = size === "lg" ? "size-4" : "size-2.5";
  const label = `Level ${level} of 5 (${SKILL_LEVELS[level]?.label})${target > level ? `, aiming for ${target}` : ""}`;
  if (!onChange)
    return (
      <span role="img" aria-label={label} title={label} className="inline-flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={cn(
              "rounded-full",
              dot,
              n <= level ? "bg-accent" : n <= target ? "border-[1.5px] border-accent" : "bg-fill-strong",
            )}
          />
        ))}
      </span>
    );
  return (
    <span role="group" aria-label={label} className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Set ${name ?? "level"} to ${n}: ${SKILL_LEVELS[n].label}`}
          aria-pressed={n === level}
          title={`${n}: ${SKILL_LEVELS[n].label} — ${SKILL_LEVELS[n].hint}`}
          className="grid size-8 place-items-center rounded-full hover:bg-fill"
        >
          <span
            className={cn(
              "rounded-full transition-colors",
              dot,
              n <= level ? "bg-accent" : n <= target ? "border-2 border-accent" : "bg-fill-strong",
            )}
          />
        </button>
      ))}
    </span>
  );
}
