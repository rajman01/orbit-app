import { ulid } from "ulid";
import type { EntityFields, EntityName } from "@/lib/sync/entities";
import type { SyncEngine } from "@/lib/sync/engine";
import { table } from "@/lib/sync/local";

/** One document the coach created or changed: the fields it wrote, and their values before. */
export interface Change {
  entity: EntityName;
  id: string;
  /** Values of the written fields before the change; null when the coach created the document. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

const META = new Set(["id", "createdAt", "updatedAt", "deletedAt", "serverVersion", "number"]);

async function current(engine: SyncEngine, entity: EntityName, id: string) {
  const doc = await table(engine.db, entity).get(id);
  return doc && doc.deletedAt == null ? (doc as Record<string, unknown>) : null;
}

function pick(doc: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => !META.has(k)).map((k) => [k, doc[k] ?? null]));
}

/**
 * A stand-in for the sync engine that the app's actions write through when the coach acts. Every
 * write still goes to the real engine (so it syncs like any edit); this also records what changed,
 * marks it as the coach's work, and refuses deletes (the coach never deletes, PRD §10.5).
 */
export function recordingEngine(engine: SyncEngine): { engine: SyncEngine; changes: Change[] } {
  const changes: Change[] = [];
  const recorder = {
    db: engine.db,
    async create<E extends EntityName>(entity: E, fields: EntityFields<E>, id: string = ulid()) {
      let f = fields as Record<string, unknown>;
      if (entity === "taskEvents") f = { ...f, actor: "ai" };
      if (entity === "tasks") f = { ...f, createdBy: "ai" };
      const existing = await current(engine, entity, id);
      await engine.create(entity, f as EntityFields<E>, id);
      changes.push({ entity, id, before: existing ? pick(existing, Object.keys(f)) : null, after: f });
      return id;
    },
    async update<E extends EntityName>(entity: E, id: string, fields: Partial<EntityFields<E>>) {
      const existing = await current(engine, entity, id);
      await engine.update(entity, id, fields);
      const f = fields as Record<string, unknown>;
      changes.push({ entity, id, before: existing ? pick(existing, Object.keys(f)) : null, after: f });
    },
    async remove(): Promise<void> {
      throw new Error("The coach can't delete things; ask the user to do it.");
    },
  };
  return { engine: recorder as unknown as SyncEngine, changes };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Takes the coach's changes back, newest first. Things it created are removed (XP entries are
 * zeroed instead: deletes win in sync, so a removed entry could never be awarded again, D31).
 * A field someone has changed since is left alone.
 */
export async function undoChanges(engine: SyncEngine, changes: Change[]): Promise<void> {
  for (const c of [...changes].reverse()) {
    const doc = await current(engine, c.entity, c.id);
    if (!doc) continue;
    if (c.before === null) {
      if (c.entity === "xpEvents") await engine.update("xpEvents", c.id, { amount: 0 });
      // A ritual has one fixed id per day; deleting it would block that day's ritual for good.
      else if (c.entity === "rituals") await engine.update("rituals", c.id, { completedAt: null });
      else await engine.remove(c.entity, c.id);
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c.after)) {
      if (!META.has(k) && same(doc[k], v)) patch[k] = c.before[k] ?? null;
    }
    if (Object.keys(patch).length) await engine.update(c.entity, c.id, patch as never);
  }
}

/** Documents the coach created in this set of changes (for the Sparkles badge and "View"). */
export function createdIds(changes: Change[], entity: EntityName): string[] {
  return changes.filter((c) => c.entity === entity && c.before === null).map((c) => c.id);
}
