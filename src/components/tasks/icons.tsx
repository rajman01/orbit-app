import type { Priority, TaskStatus } from "@/features/tasks/model";
import { cn } from "@/lib/cn";

/** DESIGN.md §2.7 — circles that fill as a task progresses. */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const c = cn("size-4 shrink-0", className);
  const r = 6.5;
  switch (status) {
    case "inbox":
      return (
        <svg viewBox="0 0 16 16" className={c} aria-hidden>
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke="var(--label-tertiary)"
            strokeWidth="1.5"
            strokeDasharray="1 2.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "backlog":
      return (
        <svg viewBox="0 0 16 16" className={c} aria-hidden>
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke="var(--label-tertiary)"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        </svg>
      );
    case "todo":
      return (
        <svg viewBox="0 0 16 16" className={c} aria-hidden>
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--label-secondary)" strokeWidth="1.5" />
        </svg>
      );
    case "in_progress":
      return (
        <svg viewBox="0 0 16 16" className={c} aria-hidden>
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          <path d="M8 3.5 A4.5 4.5 0 0 1 8 12.5 Z" fill="var(--accent)" />
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 16 16" className={c} aria-hidden>
          <circle cx="8" cy="8" r="7.25" fill="var(--success)" />
          <path
            d="M5 8.3l2 2 4-4.6"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "cancelled":
      return (
        <svg viewBox="0 0 16 16" className={c} aria-hidden>
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--label-tertiary)" strokeWidth="1.5" />
          <path
            d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"
            stroke="var(--label-tertiary)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

/** DESIGN.md §2.6 — shape first, colour second. */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const c = cn("size-4 shrink-0", className);
  if (priority === "urgent") {
    return (
      <svg viewBox="0 0 16 16" className={c} aria-hidden>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="var(--danger)" />
        <path d="M8 4.5v4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="1" fill="#fff" />
      </svg>
    );
  }
  if (priority === "none") {
    return (
      <svg viewBox="0 0 16 16" className={c} aria-hidden>
        <path d="M3 8h2M7 8h2M11 8h2" stroke="var(--label-tertiary)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  const bars = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  const color =
    priority === "high" ? "var(--label)" : priority === "medium" ? "var(--label-secondary)" : "var(--label-tertiary)";
  return (
    <svg viewBox="0 0 16 16" className={c} aria-hidden>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={2.5 + i * 4}
          y={10 - i * 3}
          width="3"
          height={4 + i * 3}
          rx="1"
          fill={i < bars ? color : "var(--fill-strong)"}
        />
      ))}
    </svg>
  );
}
