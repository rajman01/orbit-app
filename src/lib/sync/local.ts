import type { Table } from "dexie";
import type { OrbitDB } from "@/lib/local-db/db";
import type { EntityName } from "./entities";
import type { Mutation } from "./protocol";

type AnyDoc = Record<string, unknown> & { id: string };

export function table(db: OrbitDB, entity: EntityName): Table<AnyDoc, string> {
  return db.table(entity);
}

/** Applies a mutation to the local store exactly as the server would (minus versioning). */
export async function applyLocal(db: OrbitDB, m: Mutation): Promise<void> {
  const t = table(db, m.entity);
  const existing = await t.get(m.entityId);
  if (m.op === "delete") {
    if (existing)
      await t.update(m.entityId, {
        deletedAt: m.clientTime,
        updatedAt: m.clientTime,
      });
    return;
  }
  if (existing) {
    if (existing.deletedAt) return;
    await t.update(m.entityId, { ...m.fields, updatedAt: m.clientTime });
  } else {
    await t.put({
      id: m.entityId,
      createdAt: m.clientTime,
      updatedAt: m.clientTime,
      deletedAt: null,
      serverVersion: 0,
      ...m.fields,
    });
  }
}
