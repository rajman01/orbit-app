"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSync } from "@/components/app/sync-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useActions } from "@/features/actions";
import { useSettings } from "@/features/data";

interface Account {
  id: string;
  provider: "google" | "caldav";
  email: string;
  lastSyncAt: number | null;
  error: string | null;
}

const RESULT_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected. Your events will appear in a moment.",
  cancelled: "Google Calendar wasn't connected.",
  error: "Couldn't connect Google Calendar. Try again.",
  setup: "Calendars aren't set up on the server yet.",
};

/** Settings → Calendars (CAL-1): connect accounts and choose which calendars Orbit shows. */
export function CalendarSettings() {
  const engine = useSync();
  const { db } = engine;
  const actions = useActions();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<{ enabled: boolean; accounts: Account[] } | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState<Account | null>(null);
  const { blocksAccountId } = useSettings();
  const calendars = useLiveQuery(
    async () =>
      (await db.calendars.toArray()).filter((c) => c.deletedAt == null).sort((a, b) => a.name.localeCompare(b.name)),
    [db],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar/accounts", { cache: "no-store" });
      if (res.ok) setState(await res.json());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/calendar/accounts", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => live && body && setState(body))
      .catch(() => live && setOffline(true));
    return () => {
      live = false;
    };
  }, []);

  // While a first sync is running, check back every few seconds (up to a minute).
  const syncing = state?.accounts.some((a) => a.lastSyncAt == null) ?? false;
  useEffect(() => {
    if (!syncing) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 20) clearInterval(timer);
      void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [syncing, load]);

  // Back from Google: say how it went, then tidy the address.
  const result = params.get("calendar");
  useEffect(() => {
    if (!result) return;
    toast({ message: RESULT_MESSAGES[result] ?? RESULT_MESSAGES.error });
    router.replace("/settings");
    // A fresh connection syncs in the background: check back shortly.
    if (result === "connected") setTimeout(() => void load(), 4000);
  }, [result, toast, router, load]);

  const refresh = async () => {
    setBusy(true);
    try {
      await fetch("/api/calendar/sync", { method: "POST" });
      await load();
      engine.requestSync(0);
    } catch {
      toast({ message: "Couldn't refresh. Check your connection." });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (id: string, selected: boolean) => {
    await actions.showCalendar(id, selected);
    // The server fetches (or forgets) that calendar's events on its next sync; ask for it now.
    engine.requestSync(0);
    setTimeout(() => void fetch("/api/calendar/sync", { method: "POST" }).then(() => engine.requestSync(0)), 1500);
  };

  const disconnect = async (a: Account) => {
    const res = await fetch(`/api/calendar/accounts?id=${encodeURIComponent(a.id)}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!res?.ok) {
      toast({ message: "Couldn't disconnect. Try again." });
      return;
    }
    toast({ message: `Disconnected ${a.email}` });
    await load();
    engine.requestSync(0);
  };

  if (offline && !state) {
    return <p className="px-4 py-3 text-callout text-label-secondary">Connect to the internet to manage calendars.</p>;
  }
  if (state && !state.enabled) {
    return (
      <p className="px-4 py-3 text-callout text-label-secondary">
        Calendars aren&rsquo;t set up on the server yet (CALENDAR_ENCRYPTION_KEY).
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {(state?.accounts ?? []).map((a) => (
        <div key={a.id} className="flex flex-col gap-1 px-4 py-3" aria-label={`Calendar account ${a.email}`}>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-accent" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium">{a.email}</span>
              <span className={a.error ? "text-footnote text-danger-text" : "text-footnote text-label-secondary"}>
                {a.error ?? (a.lastSyncAt ? `Google · synced ${ago(a.lastSyncAt)}` : "Google · syncing…")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setDisconnecting(a)}
              className="h-8 rounded-full px-3 text-footnote font-semibold text-label-secondary hover:bg-fill"
            >
              Disconnect
            </button>
          </div>
          <ul className="flex flex-col pl-6" aria-label="Calendars to show">
            {(calendars ?? [])
              .filter((c) => c.accountId === a.id && !c.isOrbit)
              .map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-9 items-center gap-2.5 text-body">
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={(e) => void toggle(c.id, e.target.checked)}
                      aria-label={`Show ${c.name}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                    <span className="truncate">{c.name}</span>
                  </label>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {state && state.accounts.length > 1 ? (
        <label className="flex items-center gap-3 px-4 py-3 text-body">
          <span className="flex-1">Time blocks go to</span>
          <select
            aria-label="Account for time blocks"
            value={
              state.accounts.some((a) => a.id === blocksAccountId) ? (blocksAccountId as string) : state.accounts[0].id
            }
            onChange={(e) => void actions.saveSettings({ blocksAccountId: e.target.value })}
            className="h-9 max-w-[60%] truncate rounded-md bg-fill px-2 text-callout"
          >
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </label>
      ) : state?.accounts.length ? (
        <p className="px-4 pb-1 text-footnote text-label-secondary">
          Time blocks go to an &ldquo;Orbit&rdquo; calendar in this account.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {/* A plain link: the server redirects to Google's consent screen. */}
        <a
          href="/api/calendar/google/connect"
          className="inline-flex h-control items-center gap-2 rounded-md bg-fill px-4 text-body font-semibold text-label hover:bg-fill-strong"
        >
          <CalendarDays className="size-4" aria-hidden />
          {state?.accounts.some((a) => a.provider === "google")
            ? "Connect another Google account"
            : "Connect Google Calendar"}
        </a>
        {state?.accounts.length ? (
          <Button variant="ghost" icon={<RefreshCw className="size-4" />} loading={busy} onClick={() => void refresh()}>
            Refresh
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={disconnecting != null}
        onOpenChange={(o) => !o && setDisconnecting(null)}
        title={disconnecting ? `Disconnect ${disconnecting.email}?` : "Disconnect?"}
        description="Its events disappear from Orbit. Nothing in your calendar is deleted."
        confirmLabel="Disconnect"
        onConfirm={() => disconnecting && void disconnect(disconnecting)}
      />
    </div>
  );
}

function ago(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
