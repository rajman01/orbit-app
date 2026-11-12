import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";
import { pushRequestSchema } from "@/lib/sync/protocol";
import { applyMutations } from "@/lib/sync/server";

export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = pushRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const result = await applyMutations(db(), userId, body.data.mutations);
  return NextResponse.json(result);
}
