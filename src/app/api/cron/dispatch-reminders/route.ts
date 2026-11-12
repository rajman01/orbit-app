import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/mongo";
import { dispatchReminders, webPushSender } from "@/lib/push/server";

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
  const result = await dispatchReminders(db(), Date.now(), send);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
