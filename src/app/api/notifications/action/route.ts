import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { notificationAction } from "@/lib/notifications/server";

const body = z.object({
  id: z
    .string()
    .regex(/^[0-9A-Za-z]{10,40}$/)
    .nullable()
    .optional(),
  action: z.enum(["open", "done", "snooze"]),
});

/** NOT-3: a notification button pressed (sent by the service worker, with the session cookie). */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const res = await notificationAction(db(), userId, parsed.data);
  return NextResponse.json(res, { status: res.ok ? 200 : 422 });
}
