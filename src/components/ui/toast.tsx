"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";

interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

/** DESIGN.md §11.9 — pill toasts with Undo, 5s auto-dismiss, paused on hover. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { transition } = useOrbitMotion();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [paused, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={transition("snappy")}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="material-popover pointer-events-auto flex min-h-11 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-callout font-medium"
    >
      <span>{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="h-8 rounded-full px-3 font-semibold text-accent-text hover:bg-accent-fill active:bg-accent-fill"
        >
          {toast.action.label}
        </button>
      ) : null}
    </motion.div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
