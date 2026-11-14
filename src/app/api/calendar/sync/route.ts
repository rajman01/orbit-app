import { getUserId } from "@/lib/auth/server";
import { accounts, listAccounts, syncAccount } from "@/lib/calendar/server";
import { db } from "@/lib/db/mongo";

export const maxDuration = 60;

/** "Refresh": sync this user's calendar accounts now (also after choosing which calendars to show). */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const database = db();
  for (const a of await accounts(database).find({ userId }).toArray()) await syncAccount(database, a);
  return Response.json({ accounts: await listAccounts(database, userId) });
}
