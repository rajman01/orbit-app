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
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: payload.url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | undefined)?.url ?? "/today", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => new URL(c.url).origin === url.origin) as WindowClient | undefined;
      if (existing) {
        await existing.focus();
        await existing.navigate(url.href).catch(() => {});
      } else {
        await self.clients.openWindow(url.href);
      }
    })(),
  );
});
