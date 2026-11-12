"use client";

import { Check } from "lucide-react";
import { DropdownMenu as M, Popover as P } from "radix-ui";
import { cn } from "@/lib/cn";
import { Kbd } from "./pill";

export interface PickerOption<T extends string | number | null> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

const menuClass =
  "material-popover z-50 max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))] min-w-[220px] overflow-y-auto rounded-lg p-1 shadow-2 outline-none origin-[var(--radix-dropdown-menu-content-transform-origin)] animate-[menu-in_180ms_cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:animate-none";

/** A keyboard-friendly single-choice menu (DESIGN.md §11.8). Radix gives type-ahead and arrow keys. */
export function Picker<T extends string | number | null>({
  value,
  options,
  onChange,
  trigger,
  label,
  align = "start",
}: {
  value: T;
  options: PickerOption<T>[];
  onChange: (value: T) => void;
  trigger: React.ReactNode;
  label: string;
  align?: "start" | "end";
}) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className={menuClass}
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
        >
          <M.Label className="px-2 pt-1.5 pb-1 text-micro text-label-tertiary uppercase">{label}</M.Label>
          {options.map((o) => (
            <M.Item
              key={String(o.value)}
              onSelect={() => onChange(o.value)}
              className="flex h-11 cursor-default items-center gap-2 rounded-md px-2 text-body outline-none select-none data-[highlighted]:bg-fill lg:h-8"
            >
              <span className="flex w-4 justify-center">{o.icon}</span>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint ? <Kbd>{o.hint}</Kbd> : null}
              <Check
                className={cn("size-4 text-accent", o.value === value ? "opacity-100" : "opacity-0")}
                aria-hidden
              />
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

/** Small trigger used in detail panels: icon + value, looks like a quiet chip. */
export function ChipButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-callout text-label hover:bg-fill active:bg-fill-strong lg:h-7",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Popover({
  trigger,
  children,
  align = "start",
  open,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-[260px] origin-[var(--radix-popover-content-transform-origin)] animate-[menu-in_180ms_cubic-bezier(0.2,0.9,0.3,1)] rounded-lg p-2 shadow-2 material-popover outline-none motion-reduce:animate-none"
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
