"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { timing } from "@/lib/motion/springs";

type Variant = "primary" | "secondary" | "plain" | "destructive" | "ghost";
type Size = "default" | "large";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-95 active:brightness-90",
  secondary: "bg-fill text-label hover:bg-fill-strong active:bg-fill-strong",
  plain: "bg-transparent text-accent-text hover:bg-accent-fill",
  destructive: "bg-danger text-white hover:brightness-95 active:brightness-90",
  ghost: "bg-transparent text-label-secondary hover:bg-fill hover:text-label active:bg-fill-strong",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

/** DESIGN.md §11.1 — pressed state on pointer-down (scale 0.97, 100ms). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "default", loading, icon, className, children, disabled, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={timing.press}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-md px-4 text-body font-semibold whitespace-nowrap transition-[background-color,filter,opacity] duration-150 disabled:opacity-40",
        size === "large" ? "h-control-lg px-5" : "h-control",
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </motion.button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, className, variant = "ghost", ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      aria-label={label}
      title={label}
      className={cn("size-icon-btn px-0", className)}
      {...props}
    />
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin motion-reduce:animate-none", className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
