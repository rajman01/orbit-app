"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/toast";
import { useAllTasks } from "@/features/data";
import { blockedIds } from "@/features/tasks/links";

/** TASK-8: which open tasks are blocked right now, worked out once for the whole app. */
const Ctx = createContext<ReadonlySet<string>>(new Set());

export function BlockedProvider({ children }: { children: React.ReactNode }) {
  const tasks = useAllTasks();
  const blocked = useMemo(() => blockedIds(tasks ?? []), [tasks]);
  const toast = useToast();
  // "Unblocked: …" when finishing a task frees others (sent by actions.updateTask).
  useEffect(() => {
    const on = (e: Event) => {
      const titles = (e as CustomEvent<{ titles: string[] }>).detail.titles;
      toast({
        message:
          titles.length === 1
            ? `Unblocked: ${titles[0]}`
            : `Unblocked ${titles.length} tasks: ${titles.slice(0, 2).join(", ")}${titles.length > 2 ? "…" : ""}`,
      });
    };
    window.addEventListener("orbit:unblocked", on);
    return () => window.removeEventListener("orbit:unblocked", on);
  }, [toast]);
  return <Ctx.Provider value={blocked}>{children}</Ctx.Provider>;
}

export function useIsBlocked(taskId: string): boolean {
  return useContext(Ctx).has(taskId);
}

export function useBlockedSet(): ReadonlySet<string> {
  return useContext(Ctx);
}
