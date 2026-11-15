import { NextResponse } from "next/server";
import { z } from "zod";
import { createToken, listTokens, MAX_TOKENS } from "@/lib/account/tokens";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";

/** SET-8: the signed-in user's API tokens (never the tokens themselves). */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ tokens: await listTokens(db(), userId) }, { headers: { "Cache-Control": "no-store" } });
}

/** Creates a token; the response is the only time it's shown. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = z.object({ name: z.string().max(60) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const made = await createToken(db(), userId, body.data.name);
  if (!made) return NextResponse.json({ error: `At most ${MAX_TOKENS} tokens` }, { status: 409 });
  return NextResponse.json(made, { headers: { "Cache-Control": "no-store" } });
}
