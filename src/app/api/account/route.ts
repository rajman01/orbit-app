import { NextResponse } from "next/server";
import { connections } from "@/lib/account/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";

/** SET-5: how you sign in and what's connected. */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await connections(db(), userId), { headers: { "Cache-Control": "no-store" } });
}
