import { NextResponse } from "next/server";
import { exportData, exportMarkdown } from "@/lib/account/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";

export const maxDuration = 60;

/** SET-7: `?format=json` (everything) or `?format=md` (vision, goals, journal, wins), as a download. */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "md" ? "md" : "json";
  const data = await exportData(db(), userId);
  const day = data.exportedAt.slice(0, 10);
  const body = format === "md" ? exportMarkdown(data) : JSON.stringify(data, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": format === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="orbit-${day}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
