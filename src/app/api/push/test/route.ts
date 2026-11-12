import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { sendToUser, webPushSender } from "@/lib/push/server";

/** Sends a test notification to every device of the signed-in user. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const send = webPushSender();
  if (!send) return NextResponse.json({ error: "push is not set up on the server" }, { status: 503 });
  const sent = await sendToUser(
    db(),
    userId,
    { title: "Notifications are on", body: "Orbit will remind you about your rituals and habits.", url: "/settings", tag: "orbit-test" },
    send,
  );
  return NextResponse.json({ sent });
}
