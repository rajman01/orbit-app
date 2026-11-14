import { after } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { CaldavAuthFailed } from "@/lib/calendar/caldav";
import { accounts, connectCaldav, syncAccount } from "@/lib/calendar/server";
import { db } from "@/lib/db/mongo";
import { calendarEnabled } from "@/lib/env";

export const maxDuration = 60;

const bodySchema = z.object({
  appleId: z.string().trim().min(3).max(200),
  // App-specific passwords look like abcd-efgh-ijkl-mnop; accept them with or without dashes.
  password: z
    .string()
    .trim()
    .transform((p) => p.replace(/\s+/g, ""))
    .pipe(z.string().min(8).max(100)),
});

/**
 * "Connect iCloud" (CAL-2): checks the Apple ID and app-specific password against iCloud, stores
 * the password encrypted, and syncs after replying.
 */
export async function POST(request: Request) {
  const userId = await getUserId(request.headers);
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!calendarEnabled()) return Response.json({ error: "setup" }, { status: 503 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid" }, { status: 400 });
  const database = db();
  try {
    const id = await connectCaldav(database, userId, { username: body.data.appleId, password: body.data.password });
    after(async () => {
      const a = await accounts(database).findOne({ _id: id });
      if (a) await syncAccount(database, a);
    });
    return Response.json({ id });
  } catch (err) {
    if (err instanceof CaldavAuthFailed) return Response.json({ error: "auth" }, { status: 400 });
    console.error("iCloud connect failed", err);
    return Response.json({ error: "unreachable" }, { status: 502 });
  }
}
