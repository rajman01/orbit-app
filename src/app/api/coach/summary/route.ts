import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { coachConfigured, dailyLimitUsd, spentToday, summariseConversation } from "@/lib/coach/server";
import { db } from "@/lib/db/mongo";

const bodySchema = z.object({
  previous: z.string().max(8000).optional(),
  transcript: z.string().min(1).max(80_000),
});

/** Phase 3H: condenses the older part of a long coach conversation (the small model; cheap). */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!coachConfigured()) return Response.json({ error: "setup" }, { status: 503 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const database = db();
  if ((await spentToday(database, userId)) >= dailyLimitUsd())
    return Response.json({ error: "limit" }, { status: 429 });
  const summary = await summariseConversation(database, userId, body.data.transcript, body.data.previous);
  if (!summary) return Response.json({ error: "failed" }, { status: 502 });
  return Response.json({ summary });
}
