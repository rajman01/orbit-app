import { getUserId } from "@/lib/auth/server";
import { parseCapture } from "@/lib/coach/capture";
import { coachConfigured, dailyLimitUsd, spentToday } from "@/lib/coach/server";
import { db } from "@/lib/db/mongo";
import { captureRequestSchema } from "@/features/coach/capture";

/** AI-8: turns captured text into tasks for review (nothing is created here). */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!coachConfigured()) return Response.json({ error: "The coach isn't set up yet." }, { status: 503 });

  const body = captureRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid request" }, { status: 400 });

  const database = db();
  if ((await spentToday(database, userId)) >= dailyLimitUsd()) {
    return Response.json({ error: "You've reached today's coach limit." }, { status: 429 });
  }
  try {
    const tasks = await parseCapture(database, userId, body.data.text, body.data.today);
    return Response.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("coach capture failed", err);
    return Response.json({ error: "Couldn't sort that right now. Try again." }, { status: 502 });
  }
}
