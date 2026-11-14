"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Maximize2, SquarePen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  /** Opens a new conversation and sends this message (e.g. "Break down …" from a task). */
  ask: (prompt: string) => void;
}

const Ctx = createContext<CoachPanelContext | null>(null);

const ASK_EVENT = "orbit:coach-ask";

/**
 * Opens the coach with a question already sent, from anywhere (the task panel and some dialogs
 * live outside the coach's provider, so this goes through a window event).
 */
export function askCoach(prompt: string) {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: prompt }));
}

/**
 * PRD §10.6: the coach slides in from the right on desktop (⌘J), as a parallel panel with no scrim
 * so the page stays usable, and takes the full screen on phones.
 */
export function CoachPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; n: number } | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const open = useCallback((id?: string | null) => {
    if (id !== undefined) setThreadId(id);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const ask = useCallback(
    (prompt: string) => {
      // On the coach page itself the panel is hidden: start the new chat there instead.
      if (pathname === "/coach") {
        router.replace(`/coach?new=1&ask=${encodeURIComponent(prompt)}`);
        return;
      }
      setThreadId(null);
      setPending((p) => ({ text: prompt, n: (p?.n ?? 0) + 1 }));
      setOpen(true);
    },
    [pathname, router],
  );
  const value = useMemo(() => ({ open, close, toggle, ask }), [open, close, toggle, ask]);
  // The /coach page is the coach; the panel stays out of its way.
  const shown = isOpen && pathname !== "/coach";

  useEffect(() => {
    const onAsk = (e: Event) => ask(String((e as CustomEvent).detail));
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [ask]);

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
        {shown ? (
          <Panel
            key="coach"
            threadId={threadId}
            setThreadId={setThreadId}
            onClose={close}
            pending={pending}
            onSent={() => setPending(null)}
          />
        ) : null}
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
  pending,
  onSent,
}: {
  threadId: string | null;
  setThreadId: (id: string | null) => void;
  onClose: () => void;
  pending: { text: string; n: number } | null;
  onSent: () => void;
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
      <CoachConversation
        threadId={threadId}
        onThread={setThreadId}
        autoFocus={isDesktop}
        prompt={pending}
        onPromptSent={onSent}
      />
    </motion.aside>
  );
}
