import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { ulid } from "ulid";

/**
 * Phase 2D.4 (SET-8): personal API tokens for iOS Shortcuts and other integrations. A token is
 * shown once; only its SHA-256 hash is stored, with a name and when it was last used.
 */

export interface ApiToken {
  _id: string;
  userId: string;
  name: string;
  hash: string;
  /** The first characters, to tell tokens apart in Settings. */
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const PREFIX = "orb_";
export const MAX_TOKENS = 10;

const tokens = (db: Db) => db.collection<ApiToken>("apiTokens");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createToken(db: Db, userId: string, name: string, now = new Date()) {
  await tokens(db)
    .createIndex({ hash: 1 }, { unique: true })
    .catch(() => {});
  if ((await tokens(db).countDocuments({ userId })) >= MAX_TOKENS) return null;
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  const doc: ApiToken = {
    _id: ulid(),
    userId,
    name: name.trim().slice(0, 60) || "Token",
    hash: hashToken(token),
    prefix: token.slice(0, PREFIX.length + 4),
    createdAt: now,
    lastUsedAt: null,
  };
  await tokens(db).insertOne(doc);
  return { token, id: doc._id };
}

export async function listTokens(db: Db, userId: string) {
  const rows = await tokens(db).find({ userId }).sort({ createdAt: -1 }).toArray();
  return rows.map((t) => ({
    id: t._id,
    name: t.name,
    prefix: t.prefix,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeToken(db: Db, userId: string, id: string) {
  return (await tokens(db).deleteOne({ _id: id, userId })).deletedCount === 1;
}

/** The user a `Bearer orb_…` header belongs to, or null. Records the use. */
export async function userForToken(db: Db, authorization: string | null, now = new Date()): Promise<string | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token.startsWith(PREFIX) || token.length < 20 || token.length > 200) return null;
  const doc = await tokens(db).findOneAndUpdate({ hash: hashToken(token) }, { $set: { lastUsedAt: now } });
  return doc?.userId ?? null;
}
