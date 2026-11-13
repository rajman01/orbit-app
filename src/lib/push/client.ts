"use client";

import { useCallback, useEffect, useState } from "react";

export type PushSupport = "supported" | "needs-install" | "unsupported";

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS only allows push for apps added to the Home Screen (PRD §12, decision 3 of Phase 1D). */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "unsupported";
  return "supported";
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error("The offline app isn't installed yet. Reload once and try again.");
  return reg;
}

async function enable(): Promise<void> {
  const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string | null };
  if (!publicKey) throw new Error("Notifications aren't set up on the server yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed.");
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error("Couldn't save this device. Try again.");
}

async function disable(): Promise<void> {
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}

/** Push state for this device, with actions to turn it on or off and send a test. */
export function usePush() {
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = pushSupport();
    setSupport(s);
    if (s !== "supported") return setSubscribed(false);
    setPermission(Notification.permission);
    const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    const sub = await reg?.pushManager.getSubscription().catch(() => null);
    if (!sub) return setSubscribed(false);
    // The browser has a subscription; check the server still knows it.
    const known = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ subscribed: boolean }>) : { subscribed: true }))
      .catch(() => ({ subscribed: true }));
    setSubscribed(known.subscribed);
  }, []);

  useEffect(() => {
    // Reading browser-only state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return {
    support,
    permission,
    subscribed,
    busy,
    error,
    enable: run(enable),
    disable: run(disable),
    test: run(async () => {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) throw new Error("Couldn't send a test notification.");
    }),
  };
}
