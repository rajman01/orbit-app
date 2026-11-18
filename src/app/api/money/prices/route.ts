import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { refreshPrices } from "@/lib/money/prices-server";

/** 5E: "Refresh prices" from the Investments tab, for the signed-in person's holdings. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = await refreshPrices(db(), userId, Date.now());
  return NextResponse.json({ ok: true, ...res });
}
