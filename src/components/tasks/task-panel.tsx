"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import type { Task } from "@/features/tasks/model";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { useIsDesktop } from "@/lib/use-media-query";
import { TaskDetail } from "./task-detail";

interface PanelContext {
  taskId: string | null;
  open: (id: string) => void;
  close: () => void;
  /** Asks before deleting (a delete can't be undone once it syncs). */
  requestDelete: (task: Task) => void;
}

const Ctx = createContext<PanelContext | null>(null);

/** Clicks on these never close the panel: menus, popovers, dialogs, toasts, and task rows (they switch it). */
const KEEP_OPEN = "[data-radix-popper-content-wrapper], [role=dialog], [role=menu], [role=status], [data-task-row]";

/**
 * Task detail lives in one place for the whole app: a parallel side panel on desktop
 * (DESIGN.md §11.5, no scrim — the list stays usable) and a bottom sheet on phones (§11.4).
 * On desktop it closes with its × button, Escape, or a click anywhere outside it.
 */
export function TaskPanelProvider({ children }: { children: React.ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const isDesktop = useIsDesktop();
  const actions = useActions();
  const toast = useToast();
  const { transition } = useOrbitMotion();
  const panelRef = useRef<HTMLElement>(null);
  const close = useCallback(() => setTaskId(null), []);
  const requestDelete = useCallback((task: Task) => setDeleting(task), []);
  const value = useMemo(() => ({ taskId, open: setTaskId, close, requestDelete }), [taskId, close, requestDelete]);

  useEffect(() => {
    if (!taskId || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-radix-popper-content-wrapper], [role=dialog]")) close();
    };
    const onPointer = (e: PointerEvent) => {
      // While a picker, menu or dialog is open, a click elsewhere only closes that. (An open picker
      // also blocks pointer events on the page, so the click lands on <html>, not on the panel.)
      if (document.querySelector("[data-radix-popper-content-wrapper], [role=dialog], [role=menu]")) return;
      const target = e.target as Element | null;
      if (!target || panelRef.current?.contains(target) || target.closest(KEEP_OPEN)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [taskId, isDesktop, close]);

  const confirmDelete = (task: Task) => {
    void actions.deleteTask(task);
    if (taskId === task.id) close();
    toast({ message: `Deleted “${task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}”` });
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {isDesktop ? (
        <AnimatePresence>
          {taskId ? (
            <motion.aside
              ref={panelRef}
              key="task-panel"
              aria-label="Task details"
              className="fixed top-0 right-0 bottom-0 z-30 w-[420px] overflow-y-auto border-l border-separator bg-surface shadow-3"
              initial={{ x: 440 }}
              animate={{ x: 0 }}
              exit={{ x: 440 }}
              transition={transition("default")}
            >
              <TaskDetail taskId={taskId} onClose={close} />
            </motion.aside>
          ) : null}
        </AnimatePresence>
      ) : (
        <Sheet open={taskId != null} onOpenChange={(o) => !o && close()} title="Task" hideHeader>
          {taskId ? <TaskDetail taskId={taskId} onClose={close} /> : null}
        </Sheet>
      )}
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete “${deleting.title}”?` : "Delete task?"}
        description="Its subtasks and history go with it. This can't be undone."
        confirmLabel="Delete task"
        onConfirm={() => deleting && confirmDelete(deleting)}
      />
    </Ctx.Provider>
  );
}

export function useTaskPanel(): PanelContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTaskPanel must be used inside <TaskPanelProvider>");
  return c;
}
