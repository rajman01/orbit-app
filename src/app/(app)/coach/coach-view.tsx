"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, MessageSquare, SquarePen } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SyncIndicator } from "@/components/app/sync-indicator";
import { useSync } from "@/components/app/sync-provider";
import { CoachConversation } from "@/components/coach/conversation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useToday } from "@/features/use-today";
import { dayLabel, dayOf, deviceTimezone } from "@/lib/dates";

/** PRD §10.6: the standalone coach page with its list of conversations. */
export function CoachView() {
  const params = useSearchParams();
  const router = useRouter();
  const { db } = useSync();
  const threadId = params.get("t");
  const composing = params.get("new") === "1";
  const threads = useLiveQuery(
    async () =>
      (await db.aiThreads.toArray())
        .filter((t) => t.deletedAt == null && t.archivedAt == null)
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt),
    [db],
  );
  const select = useCallback((id: string | null) => router.replace(id ? `/coach?t=${id}` : "/coach?new=1"), [router]);
  const showChat = threadId != null || composing;

  return (
    <div className="flex h-[calc(100dvh-var(--tabbar-space))] lg:h-dvh">
      <aside
        className={cn("w-full flex-col border-separator lg:flex lg:w-72 lg:border-r", showChat ? "hidden" : "flex")}
      >
        <header className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-3 lg:pt-6">
          <h1 className="flex items-center gap-2 text-title1 lg:text-title2">
            Coach
            <span className="lg:hidden">
              <SyncIndicator />
            </span>
          </h1>
          <Button variant="plain" icon={<SquarePen className="size-4" />} onClick={() => select(null)}>
            New chat
          </Button>
        </header>
        <ThreadList threads={threads} selected={threadId} onSelect={select} />
      </aside>
      <section className={cn("min-w-0 flex-1 flex-col", showChat ? "flex" : "hidden lg:flex")}>
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-separator px-2 pt-[env(safe-area-inset-top)] lg:px-4 lg:pt-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="All chats"
            className="lg:hidden"
            onClick={() => router.replace("/coach")}
          >
            <ChevronLeft className="size-5" />
          </Button>
          <h2 className="min-w-0 flex-1 truncate text-headline">
            {threads?.find((t) => t.id === threadId)?.title || "New chat"}
          </h2>
        </div>
        <CoachConversation threadId={threadId} onThread={select} autoFocus />
      </section>
    </div>
  );
}

function ThreadList({
  threads,
  selected,
  onSelect,
}: {
  threads: { id: string; title: string; lastMessageAt: number }[] | undefined;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const todayDay = useToday();
  if (threads && threads.length === 0) {
    return (
      <p className="px-4 py-6 text-callout text-label-secondary">
        No conversations yet. Start one, or press ⌘J anywhere in Orbit.
      </p>
    );
  }
  return (
    <nav aria-label="Conversations" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
      {(threads ?? []).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          aria-current={t.id === selected ? "true" : undefined}
          className={cn(
            "flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-fill",
            t.id === selected && "bg-accent-fill",
          )}
        >
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-label-tertiary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body">{t.title || "Untitled"}</span>
            <span className="text-footnote text-label-tertiary">
              {dayLabel(dayOf(t.lastMessageAt, deviceTimezone()), todayDay)}
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}
