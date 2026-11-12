"use client";

import { Drawer } from "vaul";
import { cn } from "@/lib/cn";

/**
 * DESIGN.md §11.4 — bottom sheet (mobile). Vaul tracks the finger 1:1, uses release
 * velocity to pick the snap point, and can be grabbed mid-dismiss.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  trigger?: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Drawer.Trigger asChild>{trigger}</Drawer.Trigger> : null}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <Drawer.Content
          className={cn(
            "material-popover fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-xl flex-col rounded-t-xl outline-none",
            "pb-[max(env(safe-area-inset-bottom),1rem)]",
          )}
        >
          <div className="mx-auto mt-2 mb-3 h-[5px] w-9 shrink-0 rounded-full bg-fill-strong" aria-hidden />
          <div className="px-4 pb-2">
            <Drawer.Title className="text-title3">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1 text-subhead text-label-secondary">{description}</Drawer.Description>
            ) : null}
          </div>
          <div className="overflow-y-auto px-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
