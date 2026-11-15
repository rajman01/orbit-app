import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { lastRun, runJobSearch } from "@/lib/jobs/server";

/** Checking several feeds and ranking takes a while. */
export const maxDuration = 60;

/** CAR-5: when the last search ran and what it found. */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ last: await lastRun(db(), userId) }, { headers: { "Cache-Control": "no-store" } });
}

/** "Check now": a search outside the daily one, at most every 15 minutes. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await runJobSearch(db(), userId, Date.now(), { force: true });
    if (!r.ran) {
      const message =
        r.reason === "profile"
          ? "Finish your profile first: a role with bullets, the roles you want, and markets or companies."
          : r.reason === "too soon"
            ? "Checked a few minutes ago. Try again in a little while."
            : "A search is already running.";
      return Response.json({ error: message }, { status: r.reason === "profile" ? 400 : 429 });
    }
    return Response.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("job search failed", err);
    return Response.json({ error: "The search didn't finish. Try again later." }, { status: 502 });
  }
}
