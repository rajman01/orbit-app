import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Calendar tokens and passwords are encrypted at rest (AES-256-GCM) with CALENDAR_ENCRYPTION_KEY,
 * 32 random bytes in base64. Output: base64 of iv (12) + tag (16) + ciphertext.
 */
function key(): Buffer {
  const raw = process.env.CALENDAR_ENCRYPTION_KEY;
  // Tests and the fake provider use a fixed key; real deployments must set one.
  const k = Buffer.from(raw ?? (process.env.CALENDAR_FAKE === "1" ? `${"A".repeat(43)}=` : ""), "base64");
  if (k.length !== 32) throw new Error("CALENDAR_ENCRYPTION_KEY must be 32 bytes, base64");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

/** A stored secret can't be read: it was sealed with another key (the key was changed). */
export class SecretUnreadable extends Error {}

export function decrypt(sealed: string): string {
  const buf = Buffer.from(sealed, "base64");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch (err) {
    throw new SecretUnreadable(err instanceof Error ? err.message : "unreadable");
  }
}
