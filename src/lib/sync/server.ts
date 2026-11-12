import "server-only";
import type { Db, Document } from "mongodb";
import { entitySchemas, ENTITY_NAMES, type EntityName } from "./entities";
import {
  PULL_LIMIT,
  type Mutation,
  type PullChange,
  type PullResponse,
  type PushResponse,
} from "./protocol";

interface StoredDoc extends Document {
  _id: string;
  userId: string;
  fieldUpdatedAt: Record<string, number>;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  serverVersion: number;
}

/** Per-user monotonically increasing version used as the pull cursor. */
async function nextVersion(db: Db, userId: string): Promise<number> {
  const res = await db
    .collection<{ _id: string; v: number }>("syncCounters")
    .findOneAndUpdate(
      { _id: userId },
      { $inc: { v: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return res!.v;
}

let indexesReady: Promise<void> | undefined;
export function ensureSyncIndexes(db: Db): Promise<void> {
  indexesReady ??= (async () => {
    await Promise.all(
      ENTITY_NAMES.map((e) =>
        db.collection(e).createIndex({ userId: 1, serverVersion: 1 }),
      ),
    );
    await db
      .collection("syncMutations")
      .createIndex({ appliedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
  })();
  return indexesReady;
}

/**
 * Applies client mutations with field-level last-writer-wins.
 * Idempotent: a mutation id that was already applied is acknowledged without re-applying.
 * Deletes are soft (tombstones) and win over later edits.
 */
export async function applyMutations(
  db: Db,
  userId: string,
  mutations: Mutation[],
): Promise<PushResponse> {
  await ensureSyncIndexes(db);
  const applied: string[] = [];
  const rejected: PushResponse["rejected"] = [];
  const seen = db.collection<{ _id: string; userId: string; appliedAt: Date }>(
    "syncMutations",
  );

  for (const m of mutations) {
    const receiptId = `${userId}:${m.mutationId}`;
    if (await seen.findOne({ _id: receiptId }, { projection: { _id: 1 } })) {
      applied.push(m.mutationId);
      continue;
    }

    const result = await applyOne(db, userId, m);
    if (result === "ok") {
      await seen.updateOne(
        { _id: receiptId },
        { $setOnInsert: { userId, appliedAt: new Date() } },
        { upsert: true },
      );
      applied.push(m.mutationId);
    } else {
      rejected.push({ mutationId: m.mutationId, reason: result });
    }
  }
  return { applied, rejected };
}

async function applyOne(
  db: Db,
  userId: string,
  m: Mutation,
): Promise<"ok" | string> {
  const coll = db.collection<StoredDoc>(m.entity);
  const now = Date.now();
  // A device clock in the future must not lock fields forever.
  const t = Math.min(m.clientTime, now);
  const existing = await coll.findOne({ _id: m.entityId });
  if (existing && existing.userId !== userId) return "forbidden";

  if (m.op === "delete") {
    if (existing?.deletedAt) return "ok";
    const version = await nextVersion(db, userId);
    await coll.updateOne(
      { _id: m.entityId, userId },
      {
        $set: { deletedAt: t, updatedAt: now, serverVersion: version },
        $setOnInsert: { createdAt: t, fieldUpdatedAt: {} },
      },
      { upsert: true },
    );
    return "ok";
  }

  const schema = entitySchemas[m.entity as EntityName];
  const parsed = existing
    ? schema
        .partial()
        .strict()
        .safeParse(m.fields ?? {})
    : schema.strict().safeParse(m.fields ?? {});
  if (!parsed.success)
    return `invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;

  if (existing?.deletedAt) return "ok"; // delete wins

  const set: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(parsed.data)) {
    const lastWrite = existing?.fieldUpdatedAt?.[field] ?? 0;
    if (t >= lastWrite) {
      set[field] = value;
      set[`fieldUpdatedAt.${field}`] = t;
    }
  }
  if (existing && Object.keys(set).length === 0) return "ok";

  const version = await nextVersion(db, userId);
  await coll.updateOne(
    { _id: m.entityId, userId },
    {
      $set: { ...set, updatedAt: now, serverVersion: version },
      $setOnInsert: { createdAt: t, deletedAt: null },
    },
    { upsert: true },
  );
  return "ok";
}

/** Returns every document of this user changed after `since`, across all entities, in version order. */
export async function pullChanges(
  db: Db,
  userId: string,
  since: number,
  limit = PULL_LIMIT,
): Promise<PullResponse> {
  await ensureSyncIndexes(db);
  const perEntity = await Promise.all(
    ENTITY_NAMES.map(async (entity) => {
      const docs = await db
        .collection<StoredDoc>(entity)
        .find({ userId, serverVersion: { $gt: since } })
        .sort({ serverVersion: 1 })
        .limit(limit + 1)
        .toArray();
      return docs.map(
        (d) => ({ entity, doc: toClient(d) }) satisfies PullChange,
      );
    }),
  );
  const merged = perEntity
    .flat()
    .sort((a, b) => a.doc.serverVersion - b.doc.serverVersion);
  const changes = merged.slice(0, limit);
  return {
    changes,
    cursor: changes.length
      ? changes[changes.length - 1].doc.serverVersion
      : since,
    hasMore: merged.length > limit,
  };
}

function toClient(d: StoredDoc): PullChange["doc"] {
  const { _id, userId: _u, fieldUpdatedAt: _f, ...rest } = d;
  return { id: _id, ...rest };
}
