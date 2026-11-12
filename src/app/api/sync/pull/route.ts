import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { pullChanges } from "@/lib/sync/server";

export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
  if (!Number.isSafeInteger(since) || since < 0) {
    return NextResponse.json({ error: "invalid cursor" }, { status: 400 });
  }
  const result = await pullChanges(db(), userId, since);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
