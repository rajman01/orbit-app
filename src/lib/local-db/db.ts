import Dexie, { type EntityTable } from "dexie";
import type { SyncedDoc } from "@/lib/sync/entities";
import type { Mutation } from "@/lib/sync/protocol";

export interface OutboxItem extends Mutation {
  seq?: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export type OrbitDB = Dexie & {
  tasks: EntityTable<SyncedDoc<"tasks">, "id">;
  outbox: EntityTable<OutboxItem, "seq">;
  meta: EntityTable<MetaRow, "key">;
};

/** One IndexedDB database per signed-in user, so accounts never mix on a shared device. */
export function openLocalDb(userId: string): OrbitDB {
  const db = new Dexie(`orbit-${userId}`) as OrbitDB;
  db.version(1).stores({
    tasks: "id, status, order, deletedAt, serverVersion",
    outbox: "++seq, entityId",
    meta: "key",
  });
  return db;
}
