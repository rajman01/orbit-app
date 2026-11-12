"use client";

import { useSyncStatus } from "./sync-provider";
import { cn } from "@/lib/cn";

/** DESIGN.md §11.18 — no dot when synced; pulsing blue while syncing; amber when offline with pending changes. */
export function SyncIndicator({ withLabel }: { withLabel?: boolean }) {
  const { state, pending } = useSyncStatus();
  const offline = state === "offline" || state === "error";
  let label = "All changes synced";
  if (state === "syncing") label = "Syncing…";
  else if (offline && pending > 0) label = `Offline — ${pending} change${pending === 1 ? "" : "s"} waiting to sync`;
  else if (offline) label = "Offline — changes will sync";
  else if (pending > 0) label = `${pending} change${pending === 1 ? "" : "s"} waiting to sync`;

  const dot =
    state === "syncing" ? "bg-info animate-pulse motion-reduce:animate-none" : offline || pending > 0 ? "bg-warning" : null;

  return (
    <span className="inline-flex items-center gap-2 text-footnote text-label-secondary" title={label} role="status" aria-label={label}>
      {dot ? <span className={cn("size-2 rounded-full", dot)} aria-hidden /> : null}
      {withLabel ? <span>{label}</span> : null}
    </span>
  );
}
