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
