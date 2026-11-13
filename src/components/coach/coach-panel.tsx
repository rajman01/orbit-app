"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Maximize2, SquarePen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { Button } from "@/components/ui/button";
import { useOrbitMotion } from "@/lib/motion/useOrbitMotion";
import { useIsDesktop } from "@/lib/use-media-query";
import { CoachConversation } from "./conversation";

interface CoachPanelContext {
  open: (threadId?: string | null) => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = createContext<CoachPanelContext | null>(null);

/**
 * PRD §10.6: the coach slides in from the right on desktop (⌘J), as a parallel panel with no scrim
 * so the page stays usable, and takes the full screen on phones.
 */
export function CoachPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const pathname = usePathname();
  const open = useCallback((id?: string | null) => {
    if (id !== undefined) setThreadId(id);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const value = useMemo(() => ({ open, close, toggle }), [open, close, toggle]);
  // The /coach page is the coach; the panel stays out of its way.
  const shown = isOpen && pathname !== "/coach";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && isOpen && !document.querySelector("[role=dialog]:not([data-coach])")) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, close, isOpen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {shown ? <Panel key="coach" threadId={threadId} setThreadId={setThreadId} onClose={close} /> : null}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export function useCoachPanel(): CoachPanelContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCoachPanel must be used inside <CoachPanelProvider>");
  return c;
}

function Panel({
  threadId,
  setThreadId,
  onClose,
}: {
  threadId: string | null;
  setThreadId: (id: string | null) => void;
  onClose: () => void;
}) {
  const isDesktop = useIsDesktop();
  const { transition, reduced } = useOrbitMotion();
  const { db } = useSync();
  const thread = useLiveQuery(() => (threadId ? db.aiThreads.get(threadId) : undefined), [db, threadId]);
  const from = reduced ? { opacity: 0 } : isDesktop ? { x: 440 } : { y: "100%" };
  return (
    <motion.aside
      role="dialog"
      aria-modal={!isDesktop}
      aria-label="Coach"
      data-coach
      className={
        isDesktop
          ? "fixed top-0 right-0 bottom-0 z-40 flex w-[420px] flex-col border-l border-separator bg-surface shadow-3"
          : "fixed inset-0 z-[55] flex flex-col bg-bg pt-[env(safe-area-inset-top)]"
      }
      initial={from}
      animate={reduced ? { opacity: 1 } : { x: 0, y: 0 }}
      exit={from}
      transition={transition("default")}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-separator pr-2 pl-4">
        <h2 className="min-w-0 flex-1 truncate text-headline">{thread?.title || "Coach"}</h2>
        <Button variant="ghost" size="icon" aria-label="New chat" title="New chat" onClick={() => setThreadId(null)}>
          <SquarePen className="size-[18px]" />
        </Button>
        <Link
          href={threadId ? `/coach?t=${threadId}` : "/coach"}
          onClick={onClose}
          aria-label="All chats"
          title="All chats"
          className="grid size-icon-btn place-items-center rounded-md text-label-secondary hover:bg-fill hover:text-label"
        >
          <Maximize2 className="size-4" />
        </Link>
        <Button variant="ghost" size="icon" aria-label="Close coach" title="Close (Esc)" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </header>
      <CoachConversation threadId={threadId} onThread={setThreadId} autoFocus={isDesktop} />
    </motion.aside>
  );
}
