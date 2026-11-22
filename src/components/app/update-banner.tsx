"use client";

import { useSerwist } from "@serwist/turbopack/react";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * PWA-7: when a new version of Orbit has been installed behind the open page, say so and offer a
 * reload. The service worker takes over straight away (skipWaiting), but the screens already loaded
 * are the old ones until the page reloads; without this, a deploy only showed up after the app was
 * fully closed and opened again. The worker is also asked to check for updates when the app comes
 * back to the front and every half hour.
 */
export function UpdateBanner() {
  const { serwist } = useSerwist();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!serwist) return;
    const onControlling = (e: { isUpdate?: boolean }) => {
      if (e.isUpdate) setReady(true);
    };
    const onWaiting = () => setReady(true);
    serwist.addEventListener("controlling", onControlling);
    serwist.addEventListener("waiting", onWaiting);
    const check = () => void serwist.update().catch(() => undefined);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 30 * 60_000);
    return () => {
      serwist.removeEventListener("controlling", onControlling);
      serwist.removeEventListener("waiting", onWaiting);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [serwist]);

  if (!ready) return null;
  return (
    <div
      data-pin-bottom
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(var(--tabbar-space),0.75rem)] z-50 flex justify-center px-4 lg:bottom-6"
    >
      <div className="pointer-events-auto flex min-h-11 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-callout font-medium material-popover">
        <RefreshCw className="size-4 text-accent-text" aria-hidden />
        <span>A new version of Orbit is ready.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-8 rounded-full bg-accent px-3 font-semibold text-on-accent hover:brightness-95"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setReady(false)}
          aria-label="Later"
          className="h-8 rounded-full px-2 text-label-secondary hover:bg-fill"
        >
          Later
        </button>
      </div>
    </div>
  );
}
