import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth `state` for connecting a calendar: a random nonce (also kept in an httpOnly cookie) signed
 * together with the user's id, so the callback only accepts a flow this signed-in user started.
 */
export const STATE_COOKIE = "orbit_cal_state";

const sign = (userId: string, nonce: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "")
    .update(`${userId}:${nonce}`)
    .digest("base64url");

export function newState(userId: string) {
  const nonce = randomBytes(16).toString("base64url");
  return { nonce, state: `${nonce}.${sign(userId, nonce)}` };
}

export function checkState(userId: string, state: string | null, cookieNonce: string | undefined): boolean {
  if (!state || !cookieNonce) return false;
  const [nonce, sig] = state.split(".");
  if (!nonce || !sig || nonce !== cookieNonce) return false;
  const expected = Buffer.from(sign(userId, nonce));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Where Google sends the user back (must be listed in the OAuth client's redirect URIs). */
export function redirectUri(request: Request): string {
  const base = process.env.BETTER_AUTH_URL ?? new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/api/calendar/google/callback`;
}
