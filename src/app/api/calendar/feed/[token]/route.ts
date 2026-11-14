import { feedFor } from "@/lib/calendar/feed";
import { db } from "@/lib/db/mongo";

/** CAL-3: the subscription feed calendar apps fetch. The secret in the address is the only key. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ics = await feedFor(db(), token.replace(/\.ics$/, ""));
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="orbit.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
