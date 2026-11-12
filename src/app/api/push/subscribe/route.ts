import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { hasSubscription, removeSubscription, saveSubscription } from "@/lib/push/server";

const subscription = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Signs this device up for push (PRD NOT-1). */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = subscription.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  await saveSubscription(db(), userId, body.data, request.headers.get("user-agent")?.slice(0, 300) ?? null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  await removeSubscription(db(), userId, body.data.endpoint);
  return NextResponse.json({ ok: true });
}

/** Is this device's subscription known to the server? */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
  return NextResponse.json({ subscribed: endpoint ? await hasSubscription(db(), userId, endpoint) : false });
}
