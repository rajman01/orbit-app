import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/account/tokens";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";

/** Revokes a token: anything using it stops working at once. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await revokeToken(db(), userId, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
