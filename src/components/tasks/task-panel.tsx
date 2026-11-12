"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { useIsDesktop } from "@/lib/use-media-query";
import { TaskDetail } from "./task-detail";

interface PanelContext {
  taskId: string | null;
  open: (id: string) => void;
  close: () => void;
}

const Ctx = createContext<PanelContext | null>(null);

/**
 * Task detail lives in one place for the whole app: a parallel side panel on desktop
 * (DESIGN.md §11.5, no scrim — the list stays usable) and a bottom sheet on phones (§11.4).
 */
export function TaskPanelProvider({ children }: { children: React.ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const { transition } = useOrbitMotion();
  const close = useCallback(() => setTaskId(null), []);
  const value = useMemo(() => ({ taskId, open: setTaskId, close }), [taskId, close]);

  useEffect(() => {
    if (!taskId || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-radix-popper-content-wrapper], [role=dialog]")) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId, isDesktop, close]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {isDesktop ? (
        <AnimatePresence>
          {taskId ? (
            <motion.aside
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
    </Ctx.Provider>
  );
}

export function useTaskPanel(): PanelContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTaskPanel must be used inside <TaskPanelProvider>");
  return c;
}
