"use client";

import { Copy, Link2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

/**
 * CAL-3: a private link any calendar app can subscribe to (Outlook, or Apple/Google without
 * connecting): time blocks and dated tasks. Shown on request; resettable.
 */
export function FeedSettings() {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const call = async (method: "GET" | "POST") => {
    setBusy(true);
    try {
      const res = await fetch("/api/calendar/feed", { method, cache: "no-store" });
      if (!res.ok) throw new Error();
      setUrl((await res.json()).url);
      return true;
    } catch {
      toast({ message: "Couldn't get the link. Check your connection." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: "Link copied" });
    } catch {
      toast({ message: "Couldn't copy. Select the link and copy it." });
    }
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div>
        <p className="text-body font-medium">Subscribe from another calendar app</p>
        <p className="text-footnote text-label-secondary">
          A private link with your time blocks and dated tasks, for Outlook or any app that takes a calendar link.
          Anyone with the link can see them.
        </p>
      </div>
      {url ? (
        <>
          <input
            readOnly
            value={url}
            aria-label="Calendar feed link"
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 w-full truncate rounded-md bg-surface-sunken px-3 font-mono text-footnote text-label-secondary outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => void copy()}>
              Copy link
            </Button>
            <a
              href={url.replace(/^https?:/, "webcal:")}
              className="inline-flex h-control items-center gap-2 rounded-md px-3 text-body font-semibold text-accent-text hover:bg-fill"
            >
              Open in Calendar
            </a>
            <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setConfirm(true)}>
              Reset link
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          icon={<Link2 className="size-4" />}
          loading={busy}
          onClick={() => void call("GET")}
        >
          Show my calendar link
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset the calendar link?"
        description="The current link stops working straight away. Apps subscribed to it need the new one."
        confirmLabel="Reset link"
        onConfirm={() =>
          void call("POST").then((ok) => ok && toast({ message: "New link made. The old one no longer works." }))
        }
      />
    </div>
  );
}
