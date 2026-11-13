"use client";

import { ContextMenu as CM, DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/cn";
import { Kbd } from "./pill";

/** DESIGN.md §11.8 — scales from its trigger (transform-origin follows Radix's anchor). */
export function Menu({
  trigger,
  children,
  align = "start",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className={cn(
            "z-50 min-w-[200px] rounded-lg p-1 shadow-2 material-popover outline-none",
            "origin-[var(--radix-dropdown-menu-content-transform-origin)] animate-[menu-in_180ms_cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:animate-none",
          )}
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function MenuItem({
  icon,
  children,
  shortcut,
  destructive,
  onSelect,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  shortcut?: string;
  destructive?: boolean;
  onSelect?: () => void;
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        "flex h-11 cursor-default items-center gap-2 rounded-md px-2 text-body outline-none select-none lg:h-8",
        "data-[highlighted]:bg-fill",
        destructive ? "text-danger-text" : "text-label",
      )}
    >
      {icon ? <span className="text-label-secondary [&>svg]:size-4">{icon}</span> : null}
      <span className="flex-1">{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </M.Item>
  );
}

export function MenuSeparator() {
  return <M.Separator className="mx-2 my-1 h-px bg-separator" />;
}

/** Right-click menu (desktop), styled like Menu. */
export function ContextMenu({
  children,
  items,
  disabled,
}: {
  children: React.ReactNode;
  items: React.ReactNode;
  /** Off on touch screens, where a long press already means "drag". */
  disabled?: boolean;
}) {
  return (
    <CM.Root>
      <CM.Trigger asChild disabled={disabled}>
        {children}
      </CM.Trigger>
      <CM.Portal>
        <CM.Content
          className={cn(
            "z-50 min-w-[200px] rounded-lg p-1 shadow-2 material-popover outline-none",
            "origin-[var(--radix-context-menu-content-transform-origin)] animate-[menu-in_180ms_cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:animate-none",
          )}
        >
          {items}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}

export function ContextMenuItem({
  icon,
  children,
  shortcut,
  destructive,
  onSelect,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  shortcut?: string;
  destructive?: boolean;
  onSelect?: () => void;
}) {
  return (
    <CM.Item
      onSelect={onSelect}
      className={cn(
        "flex h-11 cursor-default items-center gap-2 rounded-md px-2 text-body outline-none select-none lg:h-8",
        "data-[highlighted]:bg-fill",
        destructive ? "text-danger-text" : "text-label",
      )}
    >
      {icon ? <span className="text-label-secondary [&>svg]:size-4">{icon}</span> : null}
      <span className="flex-1">{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </CM.Item>
  );
}

export function ContextMenuSeparator() {
  return <CM.Separator className="mx-2 my-1 h-px bg-separator" />;
}
