import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { coachConfigured, dailyLimitUsd, spentToday } from "@/lib/coach/server";
import { db } from "@/lib/db/mongo";
import { TailorError, tailorLead } from "@/lib/jobs/tailor";

/** Writing a whole tailored application takes a while. */
export const maxDuration = 300;

const body = z.object({ leadId: z.string().regex(/^[0-9A-Za-z]{10,40}$/) });

/** CAR-5: prepare (or redo) the application pack for a lead. Saved on the lead; nothing is sent anywhere. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!coachConfigured()) return Response.json({ error: "The AI isn't set up yet." }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const database = db();
  if ((await spentToday(database, userId)) >= dailyLimitUsd())
    return Response.json({ error: "You've reached today's AI limit. Try again tomorrow." }, { status: 429 });
  try {
    const pack = await tailorLead(database, userId, parsed.data.leadId, Date.now());
    return Response.json({ pack }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof TailorError) return Response.json({ error: err.message }, { status: 422 });
    console.error("tailoring failed", err);
    return Response.json({ error: "Couldn't prepare it right now. Try again." }, { status: 502 });
  }
}
