import { z } from "zod";

/**
 * Registry of synced entities. Each entry describes the fields a client may write.
 * Server-managed fields (id, userId, createdAt, updatedAt, deletedAt, serverVersion)
 * are never client-writable. Phase 1 extends `tasks` and adds goals, areas, cycles, etc.
 */
export const entitySchemas = {
  tasks: z.object({
    title: z.string().trim().min(1).max(500),
    status: z.enum([
      "inbox",
      "backlog",
      "todo",
      "in_progress",
      "done",
      "cancelled",
    ]),
    completedAt: z.number().int().nullable(),
    order: z.number(),
  }),
} as const;

export type EntityName = keyof typeof entitySchemas;
export const ENTITY_NAMES = Object.keys(entitySchemas) as [
  EntityName,
  ...EntityName[],
];

export type EntityFields<E extends EntityName> = z.infer<
  (typeof entitySchemas)[E]
>;

/** Fields every synced document carries, on the client and in pull responses. */
export interface SyncMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  serverVersion: number;
}

export type SyncedDoc<E extends EntityName> = SyncMeta & EntityFields<E>;
