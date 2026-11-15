import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { coachConfigured } from "@/lib/coach/server";
import { db } from "@/lib/db/mongo";
import { ImportError, importPosting } from "@/lib/jobs/server";

export const maxDuration = 60;

const body = z.object({
  url: z.string().trim().max(2000).optional(),
  text: z.string().max(60000).optional(),
});

/** At most this many links a day per person (each is a page fetch and a model call). */
const PER_DAY = 40;

/** CAR-5: add one role from a link (or its pasted text). */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!coachConfigured()) return Response.json({ error: "The AI isn't set up yet." }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.url && !parsed.data.text?.trim()))
    return Response.json({ error: "Paste a link or the job's text." }, { status: 400 });
  const database = db();
  const day = new Date().toISOString().slice(0, 10);
  const count = await database
    .collection<{ _id: string; n: number; at: Date }>("jobImports")
    .findOneAndUpdate(
      { _id: `${userId}:${day}` },
      { $inc: { n: 1 }, $setOnInsert: { at: new Date() } },
      { upsert: true, returnDocument: "after" },
    );
  if ((count?.n ?? 0) > PER_DAY)
    return Response.json({ error: "That's a lot of links for one day. Try again tomorrow." }, { status: 429 });
  try {
    const id = await importPosting(database, userId, parsed.data, Date.now());
    return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ImportError) return Response.json({ error: err.message }, { status: 422 });
    console.error("job import failed", err);
    return Response.json({ error: "Couldn't read that right now. Try again." }, { status: 502 });
  }
}
