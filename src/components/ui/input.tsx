import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-control w-full rounded-md bg-surface-sunken px-3 text-body text-label placeholder:text-label-tertiary",
        "outline-none ring-accent transition-shadow duration-150 focus-visible:ring-2 focus-visible:outline-none",
        "aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger",
        className,
      )}
      {...props}
    />
  );
});

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-footnote font-medium text-label-secondary">{label}</span>
      {children}
      {error ? <span className="text-footnote text-danger-text">{error}</span> : null}
    </label>
  );
}
