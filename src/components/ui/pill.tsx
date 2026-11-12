import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-fill text-label-secondary",
  accent: "bg-accent-fill text-accent-text",
  success: "bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success-text",
  warning: "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-warning-text",
  danger: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger-text",
};

/** DESIGN.md §11.13 — status/health pills. */
export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-caption", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-fill px-1 font-sans text-caption text-label-secondary">
      {children}
    </kbd>
  );
}
