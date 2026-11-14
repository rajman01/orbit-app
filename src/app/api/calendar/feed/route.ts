import { getUserId } from "@/lib/auth/server";
import { feedToken, resetFeed } from "@/lib/calendar/feed";
import { db } from "@/lib/db/mongo";

const link = (request: Request, token: string) => new URL(`/api/calendar/feed/${token}.ics`, request.url).toString();

/** The signed-in user's private feed link (made on first ask). */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    { url: link(request, await feedToken(db(), userId)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Reset: a new link; the old one stops working. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ url: link(request, await resetFeed(db(), userId)) });
}
