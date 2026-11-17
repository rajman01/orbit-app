"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { MessagesSquare, Sparkles } from "lucide-react";
import { useSync } from "@/components/app/sync-provider";
import { Button, IconButton } from "@/components/ui/button";
import { SUBJECT_LABEL, subjectThreadId, type CoachSubject } from "@/features/coach/subject";

const ABOUT_EVENT = "orbit:coach-about";

export interface CoachAboutRequest {
  subject: CoachSubject;
  title: string;
}

/**
 * Phase 3H: opens the coach on the conversation about this goal, task, job or course (made on
 * first use). A window event, like askCoach, so it works from the task panel too.
 */
export function coachAbout(subject: CoachSubject, title: string) {
  window.dispatchEvent(new CustomEvent<CoachAboutRequest>(ABOUT_EVENT, { detail: { subject, title } }));
}

export function onCoachAbout(handler: (r: CoachAboutRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CoachAboutRequest>).detail);
  window.addEventListener(ABOUT_EVENT, listener);
  return () => window.removeEventListener(ABOUT_EVENT, listener);
}

/** Whether this item's conversation has been started (so the button can say "Continue"). */
function useHasConversation(subject: CoachSubject): boolean {
  const { db } = useSync();
  const id = subjectThreadId(subject);
  return (
    useLiveQuery(async () => {
      const thread = await db.aiThreads.get(id);
      if (!thread || thread.archivedAt != null) return false;
      const first = await db.aiMessages.where("[threadId+seq]").between([id, -Infinity], [id, Infinity]).first();
      return first != null;
    }, [db, id]) ?? false
  );
}

/** The item's "Coach" button: a labelled button on pages, an icon where space is tight. */
export function CoachAboutButton({
  subject,
  title,
  compact,
  onOpen,
}: {
  subject: CoachSubject;
  title: string;
  compact?: boolean;
  /** Runs first (the task panel closes itself so the coach is in view). */
  onOpen?: () => void;
}) {
  const started = useHasConversation(subject);
  const kind = SUBJECT_LABEL[subject.kind].toLowerCase();
  const label = started ? `Continue with the coach about this ${kind}` : `Talk to the coach about this ${kind}`;
  const open = () => {
    onOpen?.();
    coachAbout(subject, title);
  };
  if (compact) {
    return <IconButton label={label} icon={<MessagesSquare className="size-4" />} onClick={open} />;
  }
  return (
    <Button variant="secondary" icon={<Sparkles className="size-4 text-accent" />} onClick={open} aria-label={label}>
      Coach
    </Button>
  );
}
