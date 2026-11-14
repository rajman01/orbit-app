import { ulid } from "ulid";
import type { OrbitDB } from "@/lib/local-db/db";
import type { EntityFields, EntityName } from "./entities";
import { applyLocal, table } from "./local";
import { MAX_PUSH, type Mutation, type PullResponse, type PushResponse } from "./protocol";

export type SyncState = "idle" | "syncing" | "offline" | "error" | "unauthorized";

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: number | null;
}

/** Re-pull a few versions behind the cursor so a write that committed out of order is never skipped. */
const CURSOR_OVERLAP = 20;
const INTERVAL_MS = 60_000;
/** While something live is happening (a focus session), pull this often, but only with the page in front. */
const FAST_INTERVAL_MS = 5_000;

/** Opt-in debug logging: localStorage.setItem("orbit:debug-sync", "1"). */
function debug(...args: unknown[]) {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("orbit:debug-sync"))
      console.log("[sync]", Date.now(), ...args);
  } catch {}
}

type Fetch = typeof fetch;

/**
 * Local-first sync: writes go to IndexedDB + an outbox immediately; the engine pushes
 * the outbox and pulls server changes whenever it can.
 */
export class SyncEngine {
  private running = false;
  private failures = 0;
  private again = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private fastTimer: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(s: SyncStatus) => void>();
  status: SyncStatus = { state: "idle", pending: 0, lastSyncedAt: null };

  constructor(
    readonly db: OrbitDB,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {}

  // ---------- writes ----------

  async create<E extends EntityName>(entity: E, fields: EntityFields<E>, id: string = ulid()): Promise<string> {
    await this.enqueue({ entity, entityId: id, op: "upsert", fields });
    return id;
  }

  async update<E extends EntityName>(entity: E, id: string, fields: Partial<EntityFields<E>>): Promise<void> {
    await this.enqueue({ entity, entityId: id, op: "upsert", fields });
  }

  async remove(entity: EntityName, id: string): Promise<void> {
    await this.enqueue({ entity, entityId: id, op: "delete" });
  }

  private async enqueue(partial: Omit<Mutation, "mutationId" | "clientTime">): Promise<void> {
    const m: Mutation = {
      ...partial,
      mutationId: ulid(),
      clientTime: Date.now(),
    };
    await this.db.transaction("rw", [table(this.db, m.entity), this.db.outbox], async () => {
      await applyLocal(this.db, m);
      await this.db.outbox.add(m);
    });
    await this.refreshPending();
    this.requestSync(300);
  }

  // ---------- lifecycle ----------

  private starts = 0;
  private teardown: (() => void) | null = null;

  /** Starts background syncing. Reference-counted: safe to call from several places. */
  start(): () => void {
    if (this.starts++ === 0) {
      const onOnline = () => this.requestSync();
      const onVisible = () => document.visibilityState === "visible" && this.requestSync();
      window.addEventListener("online", onOnline);
      // Switching back to this window (desktop) doesn't change visibility, so listen for focus too.
      window.addEventListener("focus", onOnline);
      document.addEventListener("visibilitychange", onVisible);
      this.timer = setInterval(() => this.requestSync(), INTERVAL_MS);
      void this.refreshPending();
      this.requestSync();
      this.teardown = () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("focus", onOnline);
        document.removeEventListener("visibilitychange", onVisible);
        clearInterval(this.timer);
        clearInterval(this.fastTimer);
        this.fastTimer = undefined;
        clearTimeout(this.debounce);
      };
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (--this.starts === 0) {
        this.teardown?.();
        this.teardown = null;
      }
    };
  }

  /**
   * Near real-time sync for live state (a running focus session, so other devices follow along).
   * Returns a cleanup, for use in an effect.
   */
  setFastSync(on: boolean): () => void {
    clearInterval(this.fastTimer);
    this.fastTimer = undefined;
    if (on && typeof window !== "undefined") {
      this.fastTimer = setInterval(() => {
        if (document.visibilityState === "visible") this.requestSync();
      }, FAST_INTERVAL_MS);
    }
    return () => {
      clearInterval(this.fastTimer);
      this.fastTimer = undefined;
    };
  }

  subscribe(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Resolves once this device has finished a sync (true), or when one fails or `timeoutMs` passes
   * (false). Used before writes that must not be made from an empty, never-synced database.
   */
  whenSynced(timeoutMs = 10_000): Promise<boolean> {
    if (this.status.lastSyncedAt != null) return Promise.resolve(true);
    if (this.starts === 0) return Promise.resolve(false); // not running (tests, or before start)
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), timeoutMs);
      const unsubscribe = this.subscribe((s) => {
        if (s.lastSyncedAt != null) done(true);
        else if (s.state === "offline" || s.state === "error" || s.state === "unauthorized") done(false);
      });
      this.requestSync(0);
    });
  }

  requestSync(delay = 0): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.sync(), delay);
  }

  /** Push the outbox, then pull. Safe to call concurrently; overlapping calls coalesce. */
  async sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.setStatus({ state: "syncing" });
    try {
      do {
        this.again = false;
        await this.push();
        await this.pull();
        // Changes made while we were pulling go out in the same run.
        if ((await this.db.outbox.count()) > 0) this.again = true;
      } while (this.again);
      this.failures = 0;
      this.setStatus({ state: "idle", lastSyncedAt: Date.now(), pending: 0 });
    } catch (err) {
      // Retry soon with backoff (2s, 4s, … 30s) instead of waiting for the next minute tick.
      this.failures++;
      if (!(err instanceof UnauthorizedError)) this.requestSync(Math.min(30_000, 1000 * 2 ** this.failures));
      if (err instanceof UnauthorizedError) this.setStatus({ state: "unauthorized" });
      else if (typeof navigator !== "undefined" && !navigator.onLine) this.setStatus({ state: "offline" });
      else if (err instanceof TypeError)
        this.setStatus({ state: "offline" }); // fetch network failure
      else {
        console.error("[sync]", err);
        this.setStatus({ state: "error" });
      }
    } finally {
      this.running = false;
      await this.refreshPending();
    }
  }

  private async push(): Promise<void> {
    for (;;) {
      const batch = await this.db.outbox.orderBy("seq").limit(MAX_PUSH).toArray();
      if (batch.length === 0) return;
      const res = await this.fetchImpl("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutations: batch.map(({ seq: _seq, ...m }) => m),
        }),
      });
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error(`push failed: ${res.status}`);
      const body = (await res.json()) as PushResponse;
      debug(
        "pushed",
        batch.map((b) => `${b.entityId.slice(-4)}:${Object.keys(b.fields ?? {}).join(",") || b.op}`),
        "applied",
        body.applied.length,
      );
      for (const r of body.rejected) console.warn("[sync] rejected", r.mutationId, r.reason);
      const done = new Set([...body.applied, ...body.rejected.map((r) => r.mutationId)]);
      await this.db.outbox.bulkDelete(batch.filter((b) => done.has(b.mutationId)).map((b) => b.seq!));
      if (batch.length < MAX_PUSH) return;
    }
  }

  private async pull(): Promise<void> {
    const stored = ((await this.db.meta.get("cursor"))?.value as number | undefined) ?? 0;
    let since = Math.max(0, stored - CURSOR_OVERLAP);
    for (;;) {
      const res = await this.fetchImpl(`/api/sync/pull?since=${since}`, {
        cache: "no-store",
      });
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error(`pull failed: ${res.status}`);
      const body = (await res.json()) as PullResponse;
      debug(
        "pulled since",
        since,
        "→",
        body.changes.map((c) => `${c.doc.id.slice(-4)}@${c.doc.serverVersion}`),
        "cursor",
        body.cursor,
      );
      await this.applyRemote(body);
      since = body.cursor;
      if (!body.hasMore) return;
    }
  }

  private async applyRemote(body: PullResponse): Promise<void> {
    const tables = [...new Set(body.changes.map((c) => c.entity))].map((e) => table(this.db, e));
    await this.db.transaction("rw", [...tables, this.db.outbox, this.db.meta], async () => {
      for (const { entity, doc } of body.changes) {
        const t = table(this.db, entity);
        const local = await t.get(doc.id);
        if (local && (local.serverVersion as number) >= doc.serverVersion) continue;
        await t.put(doc);
        // Local edits not yet acknowledged by the server stay on top.
        const pending = await this.db.outbox.where("entityId").equals(doc.id).sortBy("seq");
        for (const m of pending) await applyLocal(this.db, m);
      }
      const current = ((await this.db.meta.get("cursor"))?.value as number | undefined) ?? 0;
      if (body.cursor > current) await this.db.meta.put({ key: "cursor", value: body.cursor });
    });
  }

  private async refreshPending(): Promise<void> {
    this.setStatus({ pending: await this.db.outbox.count() });
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    debug("status", this.status.state, "pending", this.status.pending);
    for (const fn of this.listeners) fn(this.status);
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}
