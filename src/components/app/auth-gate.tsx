"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth/client";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

// ---- Last known user, persisted so the app opens offline ----

const KEY = "orbit:user";
const listeners = new Set<() => void>();
let lastRaw: string | null | undefined;
let lastUser: CurrentUser | null = null;

function getCachedUser(): CurrentUser | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== lastRaw) {
    lastRaw = raw;
    try {
      lastUser = raw ? (JSON.parse(raw) as CurrentUser) : null;
    } catch {
      lastUser = null;
    }
  }
  return lastUser;
}

function setCachedUser(user: CurrentUser | null) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  } catch {}
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The last signed-in user on this device, or null. Safe to use outside <AuthGate> (e.g. the landing page). */
export function useCachedUser(): CurrentUser | null {
  return useSyncExternalStore(subscribe, getCachedUser, () => null);
}

export function clearCachedUser() {
  setCachedUser(null);
}

const UserContext = createContext<CurrentUser | null>(null);

/**
 * Client-side auth for a local-first app: pages are static shells, so the session is
 * checked in the browser. The last known user renders instantly (and offline) while the
 * server confirms it. Every API route still verifies the session on the server.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useSyncExternalStore(subscribe, getCachedUser, () => null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authClient
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.user) {
          const { id, name, email, image } = data.user;
          setCachedUser({ id, name, email, image });
        } else if (!error || error.status === 401) {
          setCachedUser(null); // the server says we're signed out
        }
        // Any other error (offline, 5xx): keep the cached user.
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (checked && !user) router.replace("/sign-in");
  }, [checked, user, router]);

  if (!user) return <div className="min-h-dvh bg-bg" aria-busy="true" />;
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const u = useContext(UserContext);
  if (!u) throw new Error("useCurrentUser must be used inside <AuthGate>");
  return u;
}
