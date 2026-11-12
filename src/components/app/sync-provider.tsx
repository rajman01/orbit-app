"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { openLocalDb, type OrbitDB } from "@/lib/local-db/db";
import { SyncEngine, type SyncStatus } from "@/lib/sync/engine";
import { clearCachedUser, useCurrentUser } from "./auth-gate";

const EngineContext = createContext<SyncEngine | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const router = useRouter();
  // Opening Dexie is lazy, so creating the engine here has no side effects.
  const engine = useMemo(() => new SyncEngine(openLocalDb(user.id)), [user.id]);

  // Keep the latest router in a ref so a new router object never restarts the engine.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  // The local database stays open for the life of the page: closing it would cut
  // live queries off from later writes.
  useEffect(() => {
    // Ask the browser not to evict our data under storage pressure (important on iOS).
    void navigator.storage?.persist?.();
    const stop = engine.start();
    const unsub = engine.subscribe((s) => {
      if (s.state !== "unauthorized") return;
      clearCachedUser();
      routerRef.current.replace("/sign-in");
    });
    return () => {
      stop();
      unsub();
    };
  }, [engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useSync(): SyncEngine {
  const e = useContext(EngineContext);
  if (!e) throw new Error("useSync must be used inside <SyncProvider>");
  return e;
}

export function useLocalDb(): OrbitDB {
  return useSync().db;
}

export function useSyncStatus(): SyncStatus {
  const e = useSync();
  return useSyncExternalStore(
    (cb) => e.subscribe(cb),
    () => e.status,
    () => e.status,
  );
}
