import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/mongo";
import { dispatchCalendarSync } from "@/lib/calendar/server";
import { dispatchCheckins } from "@/lib/coach/checkins";
import { dispatchReminders, webPushSender } from "@/lib/push/server";
import { dispatchJobSearch } from "@/lib/jobs/server";
import { dispatchEmails } from "@/lib/email/digests";

/** Writing a check-in is a short model call; allow for a few. */
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called every minute by the external scheduler (cron-job.org) with
 * `Authorization: Bearer <CRON_SECRET>`. Sends whatever reminders are due (PRD §12).
 */
async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const send = webPushSender();
  if (!send) return NextResponse.json({ error: "push is not set up on the server" }, { status: 503 });
  const now = Date.now();
  const result = await dispatchReminders(db(), now, send);
  // Coach check-ins (PRD §8.4) ride on the same job; a failure there never blocks reminders.
  const checkins = await dispatchCheckins(db(), now, send).catch((err) => {
    console.error("coach check-ins failed", err);
    return { checkins: 0 };
  });
  // Calendars (Phase 2B): accounts with pushed changes, or due for their periodic sync.
  const calendars = await dispatchCalendarSync(db(), now, 30_000).catch((err) => {
    console.error("calendar sync failed", err);
    return { calendars: 0 };
  });
  // Job assistant (Phase 3D): one user's daily search per minute, when it's due.
  const jobs = await dispatchJobSearch(db(), now).catch((err) => {
    console.error("job search failed", err);
    return { jobSearches: 0 };
  });
  // Email (Phase 3E): the weekly report and, for people without push, important reminders.
  const mail = await dispatchEmails(db(), now).catch((err) => {
    console.error("emails failed", err);
    return { emails: 0 };
  });
  return NextResponse.json({ ...result, ...checkins, ...calendars, ...jobs, ...mail });
}

export const GET = handle;
export const POST = handle;
