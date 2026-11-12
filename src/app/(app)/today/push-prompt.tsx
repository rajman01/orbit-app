"use client";

import { BellRing, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useRituals } from "@/features/data";
import { usePush } from "@/lib/push/client";

const KEY = "orbit:push-prompt-dismissed";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
};
const dismiss = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
  for (const l of listeners) l();
};

/**
 * Asks for notification permission at a good moment (Phase 1D): after the first ritual is done,
 * never on first load. Dismissed for good with the ×; Settings has the same switch.
 */
export function PushPrompt() {
  const rituals = useRituals();
  const push = usePush();
  const dismissed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => true,
  );
  const engaged = (rituals ?? []).some((r) => r.completedAt != null);
  if (
    dismissed ||
    !engaged ||
    push.subscribed !== false ||
    push.permission === "denied" ||
    push.support === "unsupported"
  ) {
    return null;
  }
  return (
    <section
      aria-label="Reminders"
      className="mb-4 flex items-start gap-3 rounded-xl border border-separator bg-surface p-3 shadow-1 dark:bg-surface-raised"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-fill text-accent-text">
        <BellRing className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-headline">Get reminded</p>
        <p className="text-footnote text-label-secondary">
          {push.support === "needs-install"
            ? "On iPhone, add Orbit to your Home Screen (Share → Add to Home Screen), then turn on reminders from there."
            : "A nudge for your morning plan, evening shutdown and habits, even when Orbit is closed."}
        </p>
        {push.error ? <p className="mt-1 text-footnote text-danger-text">{push.error}</p> : null}
        {push.support === "supported" ? (
          <button
            type="button"
            onClick={() => void push.enable()}
            disabled={push.busy}
            className="mt-2 h-8 rounded-full bg-accent px-3.5 text-footnote font-semibold text-on-accent disabled:opacity-50"
          >
            Turn on reminders
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Not now"
        onClick={dismiss}
        className="grid size-8 place-items-center rounded-full hover:bg-fill"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
