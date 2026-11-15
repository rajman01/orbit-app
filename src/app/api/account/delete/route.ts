import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/account/server";
import { getUserId } from "@/lib/auth/server";
import { db } from "@/lib/db/mongo";

export const maxDuration = 60;

/** SET-7: deletes the account and everything in it. The body must say `{ "confirm": "DELETE" }`. */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
  await deleteAccount(db(), userId);
  const res = NextResponse.json({ ok: true });
  // The session is gone from the database; clear its cookies too.
  for (const name of ["better-auth.session_token", "__Secure-better-auth.session_token", "better-auth.session_data"])
    res.cookies.delete(name);
  return res;
}
