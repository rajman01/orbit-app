import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/mongo";
import { dispatchCheckins } from "@/lib/coach/checkins";
import { dispatchReminders, webPushSender } from "@/lib/push/server";

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
  return NextResponse.json({ ...result, ...checkins });
}

export const GET = handle;
export const POST = handle;
