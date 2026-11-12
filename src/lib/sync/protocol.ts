import { z } from "zod";
import { ENTITY_NAMES } from "./entities";

const id = z.string().regex(/^[0-9A-Za-z]{10,40}$/);

export const mutationSchema = z.object({
  mutationId: id,
  entity: z.enum(ENTITY_NAMES),
  entityId: id,
  op: z.enum(["upsert", "delete"]),
  fields: z.record(z.string(), z.unknown()).optional(),
  /** Device time (ms) when the change was made; used for last-writer-wins per field. */
  clientTime: z.number().int().positive(),
});
export type Mutation = z.infer<typeof mutationSchema>;

export const MAX_PUSH = 200;
export const PULL_LIMIT = 500;

export const pushRequestSchema = z.object({
  mutations: z.array(mutationSchema).max(MAX_PUSH),
});

export interface PushResponse {
  applied: string[];
  rejected: { mutationId: string; reason: string }[];
}

export interface PullChange {
  entity: (typeof ENTITY_NAMES)[number];
  doc: Record<string, unknown> & { id: string; serverVersion: number };
}

export interface PullResponse {
  changes: PullChange[];
  cursor: number;
  hasMore: boolean;
}
