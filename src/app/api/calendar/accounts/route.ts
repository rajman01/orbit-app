import { getUserId } from "@/lib/auth/server";
import { disconnectAccount, listAccounts } from "@/lib/calendar/server";
import { db } from "@/lib/db/mongo";
import { calendarEnabled } from "@/lib/env";

/** Connected calendar accounts (no secrets), for Settings. */
export async function GET(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    { enabled: calendarEnabled(), accounts: await listAccounts(db(), userId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Disconnect one: `DELETE /api/calendar/accounts?id=…`. */
export async function DELETE(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const ok = await disconnectAccount(db(), userId, id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
