import "server-only";
import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Web Push (Phase 1D). Optional: without them, push is simply off.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  // Shared secret for the per-minute reminder job.
  CRON_SECRET: z.string().min(16).optional(),
  // Phase 2B: encrypts calendar tokens and passwords at rest (32 bytes, base64). Without it,
  // connecting calendars is off.
  CALENDAR_ENCRYPTION_KEY: z.string().min(40).optional(),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated server environment. Throws a readable error on first use if misconfigured. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function calendarEnabled(): boolean {
  return process.env.CALENDAR_FAKE === "1" || Boolean(process.env.CALENDAR_ENCRYPTION_KEY);
}

export function pushEnabled(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
