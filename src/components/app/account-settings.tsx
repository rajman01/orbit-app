"use client";

import { ChevronRight, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearCachedUser, useCurrentUser } from "@/components/app/auth-gate";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Connections {
  email: string | null;
  signIn: string[];
  calendars: { provider: "google" | "caldav"; email: string | null; error: string | null }[];
  tokens: number;
}

const row = "flex min-h-row items-center justify-between gap-4 px-4 py-2";

/** SET-5: how you sign in and what Orbit is connected to. */
export function ConnectedAccounts() {
  const [c, setC] = useState<Connections | null>(null);
  useEffect(() => {
    void fetch("/api/account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setC)
      .catch(() => {});
  }, []);
  const signIn = c?.signIn.length
    ? c.signIn.map((p) => (p === "google" ? "Google" : p === "password" ? "Email and password" : p)).join(", ")
    : "…";
  const google = c?.calendars.filter((x) => x.provider === "google").length ?? 0;
  const icloud = c?.calendars.filter((x) => x.provider === "caldav").length ?? 0;
  return (
    <>
      <div className={row}>
        <span className="text-body">Sign in with</span>
        <span className="min-w-0 truncate text-body text-label-secondary">{signIn}</span>
      </div>
      <div className={row}>
        <span className="text-body">Calendars</span>
        <span className="min-w-0 truncate text-body text-label-secondary">
          {c
            ? [google ? `Google ${google > 1 ? `×${google}` : ""}`.trim() : "", icloud ? "iCloud" : ""]
                .filter(Boolean)
                .join(", ") || "None (connect below)"
            : "…"}
        </span>
      </div>
      <Link href="/capture" className={`${row} hover:bg-fill`}>
        <span className="text-body">Capture from anywhere</span>
        <span className="flex items-center gap-1 text-body text-label-secondary">
          {c ? (c.tokens ? `${c.tokens} token${c.tokens === 1 ? "" : "s"}` : "Set up") : "…"}
          <ChevronRight className="size-4" />
        </span>
      </Link>
    </>
  );
}

/** SET-7: take everything with you, or delete it all. */
export function YourData() {
  const user = useCurrentUser();
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    }).catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      setError("Couldn't delete the account. Check your connection and try again.");
      return;
    }
    // Nothing of the account stays on this device either.
    clearCachedUser();
    try {
      indexedDB.deleteDatabase(`orbit-${user.id}`);
    } catch {}
    window.location.replace("/");
  }

  return (
    <>
      <a href="/api/export?format=json" download className={`${row} hover:bg-fill`}>
        <span className="text-body">Export everything</span>
        <span className="flex items-center gap-1.5 text-body text-label-secondary">
          JSON <Download className="size-4" />
        </span>
      </a>
      <a href="/api/export?format=md" download className={`${row} hover:bg-fill`}>
        <span className="text-body">Export vision, goals, journal and wins</span>
        <span className="flex items-center gap-1.5 text-body text-label-secondary">
          Markdown <Download className="size-4" />
        </span>
      </a>
      <button type="button" onClick={() => setDeleting(true)} className={`${row} w-full text-left hover:bg-fill`}>
        <span className="text-body text-danger-text">Delete account…</span>
        <Trash2 className="size-4 text-danger-text" />
      </button>
      <Dialog
        open={deleting}
        onOpenChange={(o) => {
          if (busy) return;
          setDeleting(o);
          setTyped("");
          setError(null);
        }}
        title="Delete your account?"
        description="Everything you've put in Orbit is deleted from the server straight away: goals, tasks, journal, people, the lot. Connected calendars are disconnected. Backups expire within 30 days. You can't undo this."
      >
        <div className="mt-4 flex flex-col gap-3">
          <a href="/api/export?format=json" download className="text-callout font-semibold text-accent-text">
            Export everything first
          </a>
          <label className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-label-secondary">Type DELETE to confirm</span>
            <Input
              aria-label="Type DELETE to confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
            />
          </label>
          {error ? <p className="text-footnote text-danger-text">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={typed !== "DELETE"} loading={busy} onClick={() => void remove()}>
              Delete account
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
