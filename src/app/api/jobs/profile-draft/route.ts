import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { coachConfigured, dailyLimitUsd, spentToday } from "@/lib/coach/server";
import { db } from "@/lib/db/mongo";
import { draftProfileFromCv } from "@/lib/jobs/ai";

export const maxDuration = 300;

const body = z.object({ text: z.string().trim().min(40).max(60000) });

/** CAR-5: a pasted CV → a draft profile to check (nothing is saved here). */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!coachConfigured()) return Response.json({ error: "The AI isn't set up yet." }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Paste the text of your CV (at least a few lines)." }, { status: 400 });
  const database = db();
  if ((await spentToday(database, userId)) >= dailyLimitUsd())
    return Response.json({ error: "You've reached today's AI limit. Try again tomorrow." }, { status: 429 });
  try {
    const draft = await draftProfileFromCv(database, userId, parsed.data.text);
    if (!draft) return Response.json({ error: "Couldn't read a CV in that text." }, { status: 422 });
    return Response.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("profile draft failed", err);
    return Response.json({ error: "Couldn't read that right now. Try again." }, { status: 502 });
  }
}
