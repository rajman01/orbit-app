"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Sparkles } from "lucide-react";
import { useSync } from "@/components/app/sync-provider";
import { useMinuteNow } from "@/features/use-today";
import type { Change } from "@/features/coach/record";

const DAY = 86_400_000;

/** DESIGN.md: a small Sparkles badge on anything the coach made, for its first 24 hours. */
export function AiBadge({ createdAt, show = true }: { createdAt: number; show?: boolean }) {
  const now = useMinuteNow();
  if (!show || now - createdAt > DAY) return null;
  return (
    <Sparkles className="inline size-3.5 shrink-0 align-[-2px] text-accent" aria-label="Made by the coach" role="img" />
  );
}

/** For things without a createdBy field (goals…): did a coach action in the last day create it? */
export function AiMadeBadge({ entity, id }: { entity: "goals" | "habits"; id: string }) {
  const { db } = useSync();
  const createdAt = useLiveQuery(async () => {
    const recent = await db.aiActions
      .where("at")
      .above(Date.now() - DAY)
      .toArray();
    const hit = recent.find(
      (a) =>
        a.status === "applied" &&
        a.deletedAt == null &&
        (a.changes as Change[]).some((c) => c.entity === entity && c.id === id && c.before === null),
    );
    return hit?.at ?? null;
  }, [db, entity, id]);
  return createdAt ? <AiBadge createdAt={createdAt} /> : null;
}
