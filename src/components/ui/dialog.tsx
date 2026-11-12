"use client";

import { AnimatePresence, motion } from "motion/react";
import { Dialog as D } from "radix-ui";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { Button } from "./button";

/** DESIGN.md §11.6 — only for destructive confirmations, rituals and onboarding. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 440,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  width?: number;
}) {
  const { transition } = useOrbitMotion();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--scrim)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition("snappy")}
              />
            </D.Overlay>
            <D.Content asChild forceMount>
              <motion.div
                className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] rounded-xl bg-surface-raised p-6 shadow-3 outline-none"
                style={{ maxWidth: width, x: "-50%", y: "-50%" }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={transition("snappy")}
              >
                <D.Title className="text-title3">{title}</D.Title>
                {description ? (
                  <D.Description className="mt-2 text-callout text-label-secondary">{description}</D.Description>
                ) : null}
                {children}
              </motion.div>
            </D.Content>
          </D.Portal>
        ) : null}
      </AnimatePresence>
    </D.Root>
  );
}

/** Destructive confirmation that names the thing being destroyed. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
