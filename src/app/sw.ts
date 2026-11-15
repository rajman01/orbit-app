/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    // Page shells are cached without query strings; /goal?id=… and /area?id=… must
    // still match /goal and /area when offline.
    ignoreURLParametersMatching: [/.*/],
    cleanupOutdatedCaches: true,
  },
  // Activate new versions on the next load instead of waiting for every tab to close.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cache API responses: sync data must always be fresh, and cached
    // responses could leak one account's data to another on a shared device.
    // Offline data lives in IndexedDB, not in the HTTP cache.
    { matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// ---------------------------------------------------------------- push (PRD §12, Phase 1D)

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** NOT-5: the notification centre entry. */
  id?: string | null;
  /** NOT-3: buttons where supported (habits: Done; reminders: Snooze 15 min). */
  actions?: { action: string; title: string }[];
}

self.addEventListener("push", (event) => {
  let payload: PushPayload;
  try {
    payload = event.data?.json() as PushPayload;
  } catch {
    return;
  }
  if (!payload?.title) return;
  event.waitUntil(
    (async () => {
      // Orbit open and in front: the app already shows what's due, so don't double up.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((c) => (c as WindowClient).focused && (c as WindowClient).visibilityState === "visible")) return;
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        // Replacing a quiet "Focusing on…" notification with the same tag should still alert.
        renotify: true,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: payload.url, id: payload.id ?? null },
        actions: payload.actions ?? [],
      } as NotificationOptions);
    })(),
  );
});

/** Tells Orbit a notification was opened or a button pressed (signed in through the session cookie). */
async function report(id: string | null, action: string): Promise<boolean> {
  try {
    const r = await fetch("/api/notifications/action", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as { url?: string; id?: string | null };
  const url = new URL(data.url ?? "/today", self.location.origin);
  event.waitUntil(
    (async () => {
      // NOT-3: Done / Snooze act without opening Orbit; if that fails, open it instead.
      let opened: Promise<boolean> | null = null;
      if (event.action === "done" || event.action === "snooze") {
        if (await report(data.id ?? null, event.action)) return;
      } else if (data.id) {
        opened = report(data.id, "open");
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => new URL(c.url).origin === url.origin) as WindowClient | undefined;
      if (existing) {
        await existing.focus();
        await existing.navigate(url.href).catch(() => {});
      } else {
        await self.clients.openWindow(url.href);
      }
      await opened;
    })(),
  );
});
